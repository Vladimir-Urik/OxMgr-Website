---
title: Auto-Deploy Node.js with Git Webhooks — No CI/CD Pipeline Needed
description: Set up automatic deployments triggered by git push — without Jenkins, GitHub Actions, or any CI/CD service. A webhook server, a deploy script, and Oxmgr are all you need.
date: 2026-04-30
tags: [deployment, git, webhooks, ci-cd, devops, node.js, automation]
keywords: [git webhook deploy node.js, auto deploy on git push, github webhook deployment, node.js auto deploy, deploy on push, webhook server node.js, github webhook node.js server, auto deploy without ci cd]
author: Oxmgr Team
---

Every time you push to `main`, you want the code running on your server to update automatically. The full CI/CD setup — GitHub Actions, build servers, artifact storage — is powerful but overkill for a single VPS.

Here's the simpler path: a webhook listener that receives push events from GitHub, runs your deploy script, and uses Oxmgr for zero-downtime restarts.

## How It Works

```
git push origin main
        │
   GitHub receives push
        │
   GitHub sends POST to your server
        │
   Webhook server validates + runs deploy.sh
        │
   deploy.sh: git pull + build + oxmgr reload
        │
   Zero-downtime deploy complete
```

Total time: ~30 seconds from push to live, with zero manual steps.

## Prerequisites

- A VPS or server with Node.js installed
- Oxmgr managing your app processes
- A GitHub (or GitLab) repository
- Port 9000 open on your server firewall

## Step 1: The Deploy Script

Before the webhook, get the deploy script working manually:

```bash
# /var/www/myapp/deploy.sh
#!/bin/bash
set -euo pipefail

APP_DIR="/var/www/myapp"
APP_NAME="api"

echo "=== Deploy started: $(date) ==="

cd "$APP_DIR"

# Pull latest code
git fetch origin main
git reset --hard origin/main

# Install dependencies if lockfile changed
if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "package-lock.json"; then
  echo "Installing dependencies..."
  npm ci --omit=dev
fi

# Build
if [ -f "package.json" ] && jq -e '.scripts.build' package.json > /dev/null 2>&1; then
  echo "Building..."
  npm run build
fi

# Zero-downtime restart
echo "Reloading processes..."
oxmgr reload "$APP_NAME"

# Verify health
echo "Checking health..."
sleep 3
if curl -sf "http://localhost:3000/health" > /dev/null; then
  echo "=== Deploy successful: $(date) ==="
else
  echo "=== ERROR: Health check failed ==="
  oxmgr status
  exit 1
fi
```

Make it executable and test it:

```bash
chmod +x /var/www/myapp/deploy.sh
/var/www/myapp/deploy.sh
```

Make sure it completes without errors before adding the webhook.

## Step 2: The Webhook Server

A webhook server listens for POST requests from GitHub and runs the deploy script when the signature is valid.

```bash
npm install express crypto
```

```javascript
// webhook-server.js
import express from 'express';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const app = express();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || '/var/www/myapp/deploy.sh';
const BRANCH = process.env.DEPLOY_BRANCH || 'main';
const PORT = parseInt(process.env.PORT || '9000');

if (!WEBHOOK_SECRET) {
  console.error('WEBHOOK_SECRET environment variable is required');
  process.exit(1);
}

// Parse raw body for signature verification
app.use(express.raw({ type: 'application/json' }));

// Verify GitHub signature
function verifySignature(payload, signature) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

// Track deploy state
let deploying = false;
let lastDeploy = null;

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];

  // Verify it's really from GitHub
  if (!signature || !verifySignature(req.body, signature)) {
    console.warn('Invalid signature — rejecting webhook');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = JSON.parse(req.body.toString());

  // Only process push events to the right branch
  if (event !== 'push' || payload.ref !== `refs/heads/${BRANCH}`) {
    return res.json({ status: 'ignored', event, ref: payload.ref });
  }

  // Only one deploy at a time
  if (deploying) {
    console.log('Deploy already in progress — queuing skipped');
    return res.json({ status: 'skipped', reason: 'deploy in progress' });
  }

  const commit = payload.head_commit;
  console.log(`Deploying commit: ${commit.id.slice(0, 8)} — ${commit.message}`);

  // Respond immediately so GitHub doesn't timeout
  res.json({ status: 'deploying', commit: commit.id.slice(0, 8) });

  // Run deploy asynchronously
  deploying = true;
  try {
    const { stdout, stderr } = await execAsync(DEPLOY_SCRIPT, {
      timeout: 120_000, // 2-minute timeout
      env: { ...process.env }
    });

    console.log(stdout);
    if (stderr) console.error(stderr);

    lastDeploy = {
      commit: commit.id,
      message: commit.message,
      author: commit.author.name,
      deployedAt: new Date().toISOString(),
      status: 'success'
    };

    console.log(`Deploy complete: ${commit.id.slice(0, 8)}`);
  } catch (err) {
    console.error('Deploy failed:', err.message);
    console.error(err.stdout);
    console.error(err.stderr);

    lastDeploy = {
      commit: commit.id,
      deployedAt: new Date().toISOString(),
      status: 'failed',
      error: err.message
    };
  } finally {
    deploying = false;
  }
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    deploying,
    lastDeploy,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`Webhook server listening on :${PORT}`);
});
```

## Step 3: Manage with Oxmgr

Add the webhook server to your `oxfile.toml`:

```toml
# Your main app
[processes.api]
command = "node dist/server.js"
instances = 2
restart_on_exit = true
restart_delay_ms = 1000

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30


# Webhook server — always running, auto-restart
[processes.webhook]
command = "node webhook-server.js"
restart_on_exit = true
restart_delay_ms = 2000

[processes.webhook.env]
PORT = "9000"
WEBHOOK_SECRET = "your-webhook-secret-here"
DEPLOY_SCRIPT = "/var/www/myapp/deploy.sh"
DEPLOY_BRANCH = "main"
```

Start everything:

```bash
oxmgr start
```

The webhook server now runs alongside your app and restarts automatically if it crashes.

## Step 4: GitHub Webhook Configuration

1. Go to your repository → **Settings** → **Webhooks** → **Add webhook**

2. Configure:
   - **Payload URL:** `http://your-server-ip:9000/webhook`
   - **Content type:** `application/json`
   - **Secret:** Same value as `WEBHOOK_SECRET` in your config
   - **Which events:** `Just the push event`
   - **Active:** ✓

3. Click **Add webhook**

GitHub immediately sends a `ping` event. Check the **Recent Deliveries** tab to verify it reached your server (you'll see a 200 response since we respond to all events).

## Step 5: Secure with Nginx

Exposing port 9000 directly is fine, but routing through Nginx gives you TLS (HTTPS) and a cleaner URL:

```nginx
# /etc/nginx/sites-available/myapp
server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSL config (certbot managed)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Main app
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Webhook — separate path
    location /webhook {
        proxy_pass http://localhost:9000/webhook;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /deploy-status {
        proxy_pass http://localhost:9000/status;
    }
}
```

Update your GitHub webhook URL to:
`https://your-domain.com/webhook`

## Testing the Full Flow

Push a change to `main`:

```bash
git commit -m "test: trigger webhook deploy"
git push origin main
```

On your server, watch the webhook server logs:

```bash
oxmgr logs webhook -f
```

You should see:
```
Deploying commit: a3f8b1c2 — test: trigger webhook deploy
=== Deploy started: Mon Apr 30 12:34:56 UTC 2026 ===
Building...
Reloading processes...
Checking health...
=== Deploy successful: Mon Apr 30 12:35:22 UTC 2026 ===
Deploy complete: a3f8b1c2
```

Check deploy status via the API:

```bash
curl https://your-domain.com/deploy-status | jq .
```

```json
{
  "deploying": false,
  "lastDeploy": {
    "commit": "a3f8b1c2d3e4f5a6",
    "message": "test: trigger webhook deploy",
    "author": "Your Name",
    "deployedAt": "2026-04-30T12:35:22.000Z",
    "status": "success"
  },
  "uptime": 3600.23
}
```

## Handling Deploy Failures

When a deploy fails, you want to know immediately. Add Slack notification to the deploy script:

```bash
# In deploy.sh
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

notify_slack() {
  local status=$1
  local message=$2
  curl -s -X POST "$SLACK_WEBHOOK" \
    -H 'Content-type: application/json' \
    -d "{\"text\": \"$status Deploy on $(hostname): $message\"}"
}

# At the end of the script
if [ $? -eq 0 ]; then
  notify_slack "✅" "Deploy successful"
else
  notify_slack "🔴" "Deploy FAILED — check logs"
fi
```

## Rollback

Webhook deploys make rollback easy — just push a revert commit:

```bash
git revert HEAD --no-edit
git push origin main
# Webhook triggers, reverted code deploys automatically
```

Or, for immediate rollback to a specific commit:

```bash
git reset --hard <previous-commit>
git push --force origin main
```

For zero-downtime deploys and the rolling restart mechanism, see the [zero-downtime deployment guide](/blog/zero-downtime-deployment).

## When to Upgrade to CI/CD

Webhook deploys work well until you need:
- Running tests before deploying
- Multiple environments (staging, production)
- Docker image building
- Deployment approval workflows
- Deployment history and audit trails

At that point, GitHub Actions or a dedicated CI/CD system is worth the overhead. Until then, a webhook + deploy script is reliable, fast, and has zero dependencies on external services.
