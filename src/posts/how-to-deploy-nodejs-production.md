---
title: How to Deploy a Node.js App to Production (That Stays Up)
description: A practical guide to deploying Node.js to a VPS with zero-downtime restarts, crash recovery, environment variables, and process management — without over-engineering it.
date: 2026-03-09
tags: [node.js, deployment, production, vps, tutorial]
keywords: [deploy node.js production, node.js vps deployment, node.js production server, keep node.js running, node.js deployment guide 2025, node.js crash recovery, production process manager node]
author: Oxmgr Team
---

Most Node.js deployment tutorials stop at "it works on my VPS." This one goes further: crash recovery, zero-downtime restarts, environment management, and logs you can actually read at 3am.

No Kubernetes. No Docker (unless you want it). Just a Node.js app running reliably on a server.

## What "Production-Ready" Actually Means

Before touching a server, get clear on the requirements:

1. **The app restarts automatically after a crash** — no manual SSH required
2. **The app starts on system boot** — server reboots don't cause outages
3. **Deploys don't cause downtime** — users don't see errors during updates
4. **Logs are accessible and searchable** — you can diagnose problems after the fact
5. **Environment variables are managed securely** — secrets aren't in your code

Let's build this from scratch.

## Step 1: Set Up Your Server

For most apps, a $6–12/month VPS (DigitalOcean, Hetzner, Vultr) is sufficient to start.

After creating the server, connect via SSH and update packages:

```bash
apt update && apt upgrade -y
```

Install Node.js via nvm (avoids permission issues with global packages):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

Verify:

```bash
node --version  # v20.x.x
npm --version   # 10.x.x
```

## Step 2: Deploy Your Application Code

Use git to pull your code directly to the server. Create a dedicated user (never run production apps as root):

```bash
adduser nodeapp
su - nodeapp
mkdir -p ~/apps/myapp
cd ~/apps/myapp
git clone https://github.com/yourorg/myapp.git .
npm install --omit=dev
```

Build if needed:

```bash
npm run build
```

## Step 3: Manage Environment Variables

Never put secrets in your code or commit `.env` files to git. Create them on the server:

```bash
nano ~/apps/myapp/.env.production
```

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
JWT_SECRET=your-secret-here
```

Set permissions so only the app user can read it:

```bash
chmod 600 ~/apps/myapp/.env.production
```

In your `oxfile.toml`, reference the env file:

```toml
[processes.app]
command = "node dist/server.js"
env_file = ".env.production"
```

Or set variables directly in the config (for non-secrets):

```toml
[processes.app]
command = "node dist/server.js"
env = { NODE_ENV = "production", PORT = "3000" }
```

## Step 4: Install a Process Manager

This is the critical step that most tutorials skip or under-explain.

Install Oxmgr:

```bash
npm install -g oxmgr
```

Create `oxfile.toml` in your app directory:

```toml
[processes.app]
command = "node dist/server.js"
instances = 2          # use both CPU cores on a 2-core VPS
restart_on_exit = true
restart_delay_ms = 100
env_file = ".env.production"

[processes.app.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30
timeout_secs = 5
```

Start your processes:

```bash
oxmgr start
```

Check status:

```bash
oxmgr status
```

```
PROCESS   PID    STATUS    UPTIME   RESTARTS   MEM
app:0     12847  running   2h 14m   0          48 MB
app:1     12848  running   2h 14m   0          47 MB
```

## Step 5: Configure System Boot

You want your apps to start automatically when the server reboots. Create a systemd service for the Oxmgr daemon:

```bash
sudo nano /etc/systemd/system/oxmgr-myapp.service
```

```ini
[Unit]
Description=Oxmgr process manager for myapp
After=network.target

[Service]
Type=forking
User=nodeapp
WorkingDirectory=/home/nodeapp/apps/myapp
ExecStart=/home/nodeapp/.nvm/versions/node/v20.11.0/bin/oxmgr start --daemon
ExecStop=/home/nodeapp/.nvm/versions/node/v20.11.0/bin/oxmgr stop
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable oxmgr-myapp
sudo systemctl start oxmgr-myapp
```

Test by rebooting: `sudo reboot`. SSH back in and check `oxmgr status` — your processes should already be running.

## Step 6: Zero-Downtime Deploys

The naive deploy pattern kills your app, pulls new code, and starts it. Users see errors for ~2 seconds.

The better pattern with Oxmgr:

```bash
# 1. Pull new code
git pull origin main

# 2. Install dependencies (if changed)
npm install --omit=dev

# 3. Build
npm run build

# 4. Reload with zero downtime
oxmgr reload app
```

`oxmgr reload` uses a rolling restart: it starts a new instance, waits for it to pass health checks, then shuts down the old instance. If health checks fail, it rolls back automatically.

For a complete deploy script:

```bash
#!/bin/bash
set -e

cd ~/apps/myapp

echo "Pulling latest code..."
git pull origin main

echo "Installing dependencies..."
npm install --omit=dev

echo "Building..."
npm run build

echo "Reloading processes..."
oxmgr reload

echo "Deploy complete. Status:"
oxmgr status
```

Make it executable and run it:

```bash
chmod +x deploy.sh
./deploy.sh
```

## Step 7: Set Up a Reverse Proxy

Your Node.js app shouldn't be directly accessible on port 3000. Put Nginx in front:

```bash
sudo apt install nginx -y
```

```nginx
# /etc/nginx/sites-available/myapp
server {
    listen 80;
    server_name myapp.com www.myapp.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Add HTTPS with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d myapp.com -d www.myapp.com
```

## Step 8: Log Management

View live logs:

```bash
oxmgr logs app --follow
```

View recent errors:

```bash
oxmgr logs app --level error --lines 50
```

Oxmgr rotates logs automatically at 100 MB by default. Configure rotation in `oxfile.toml`:

```toml
[logging]
max_size_mb = 50
max_files = 7
compress = true
```

## What You Now Have

After following these steps:

- ✓ **Crash recovery** — any process that dies restarts in ~11ms
- ✓ **Boot persistence** — processes survive server reboots via systemd
- ✓ **Zero-downtime deploys** — rolling restarts with automatic rollback
- ✓ **Health monitoring** — HTTP health checks run every 30 seconds
- ✓ **Structured logs** — searchable, rotated, compressed
- ✓ **HTTPS** — via Certbot + Nginx
- ✓ **Environment security** — secrets in permission-restricted `.env` files

This setup handles most production workloads comfortably to tens of thousands of users per day. When you outgrow a single VPS, the same `oxfile.toml` moves with you.

See the full [documentation](/docs) for health check configuration, resource limits, and multi-server setups.
