---
title: How to Restart a Node.js Server — Every Method Explained
description: From Ctrl+C to zero-downtime rolling restarts — every way to restart a Node.js server, when to use each, and how to set up automatic restarts so you never have to do it manually again.
date: 2026-04-12
tags: [node.js, restart, deployment, process-manager, tutorial]
keywords: [how to restart node.js server, restart node.js, node.js restart, auto restart node.js, node.js server restart, restart node.js app, node.js automatic restart, pm2 restart, node.js reload]
author: Oxmgr Team
---

# How to Restart a Node.js Server

There are five different ways to restart a Node.js server, from "kill it and start it again" to "roll through instances with zero downtime." Here's when to use each.

## Method 1: Ctrl+C and Re-run (Development Only)

```bash
node server.js
# Ctrl+C
node server.js
```

Fine for development. In production, this causes downtime and requires someone to be at the terminal. Never use this in production.

## Method 2: Kill the Process by PID

```bash
# Find the PID
pgrep -a node
# or
ps aux | grep node

# Kill it (graceful SIGTERM)
kill 12847

# Wait, then start again
node dist/server.js &
```

This causes downtime equal to your app's startup time. Useful for one-off fixes when you're already SSHed in, but not for regular deployments.

Kill signals matter:

```bash
kill 12847       # SIGTERM — graceful, app can finish requests
kill -9 12847    # SIGKILL — immediate, no cleanup
```

Always try SIGTERM first. Give it 10–30 seconds. Only use SIGKILL if the process won't respond.

## Method 3: Nodemon (Development Auto-Restart)

```bash
npm install -D nodemon
npx nodemon src/server.ts
```

Nodemon watches your files and restarts the server when they change. Great for development. **Not for production** — it watches all files for changes, which is unnecessary overhead and a security concern in a production environment.

## Method 4: Process Manager Restart (Production)

When you're using a process manager, use its restart command:

```bash
# Oxmgr
oxmgr restart api        # all instances
oxmgr restart api:0      # specific instance

# PM2
pm2 restart api

# Systemd
sudo systemctl restart myapp
```

**This causes brief downtime.** All instances restart simultaneously. For most setups with a process manager and multiple instances, the downtime is very short (under a second), but it exists.

Use this for:
- Emergency restarts
- Config changes that require full restart
- When you can tolerate brief downtime

## Method 5: Zero-Downtime Reload (Production)

This is what you should use for routine deployments:

```bash
# Oxmgr — rolling restart with health check gating
oxmgr reload api

# PM2 — rolling restart
pm2 reload api       # NOT pm2 restart

# Systemd — no built-in rolling restart for multi-instance
```

**How it works:** instances restart one at a time. The first instance gets SIGTERM, finishes its in-flight requests, exits, and a new instance starts in its place. Once the health check passes, the next instance restarts.

```
[instance 0: v1] [instance 1: v1] [instance 2: v1]
     ↓ SIGTERM
[instance 0: v2] [instance 1: v1] [instance 2: v1]  ← health check passes
                      ↓ SIGTERM
[instance 0: v2] [instance 1: v2] [instance 2: v1]  ← health check passes
                                       ↓ SIGTERM
[instance 0: v2] [instance 1: v2] [instance 2: v2]  ← done
```

Users hitting the app during the reload hit one of the running instances — they never see downtime.

**Requirement:** your app must handle SIGTERM gracefully:

```javascript
process.on('SIGTERM', () => {
  server.close(() => {
    // finish in-flight requests, close DB connections
    process.exit(0);
  });
});
```

## Method 6: File-Watcher Auto-Restart in Production

For apps where you want automatic restarts when files change (e.g., an interpreted script that doesn't need a build step):

```toml
# oxfile.toml
[processes.api]
command = "node server.js"
watch = ["src", "config"]           # watch these directories
watch_ignore = ["node_modules", ".git"]
restart_on_exit = true
```

Oxmgr watches for file changes and triggers a restart. Use this carefully in production — accidental file writes can cause unexpected restarts.

## Setting Up Automatic Restart on Crash

This is the most important one: making restarts happen automatically when your app crashes, without any human intervention.

```toml
# oxfile.toml — automatic crash recovery
[processes.api]
command = "node dist/server.js"
restart_on_exit = true        # restart on any exit (crash or clean)
restart_delay_ms = 100        # wait 100ms before restart
max_restarts = 20             # stop trying after 20 crashes in a row
instances = 2                 # run 2 instances for redundancy
```

With this config, if instance 0 crashes:
1. Oxmgr detects the exit event in ~1ms
2. Sends a spawn command
3. New instance starts (~40ms for a simple Node.js app)
4. Health check passes
5. Traffic resumes

Total downtime for that instance: ~50ms. The other instance handled all traffic during this window.

## Setting Up Restart on System Boot

Your process manager needs to start at boot, or your app will be down after every server reboot.

**With systemd:**

```bash
# Create a systemd unit for Oxmgr
sudo nano /etc/systemd/system/myapp.service
```

```ini
[Unit]
Description=Oxmgr for myapp
After=network-online.target

[Service]
Type=forking
User=nodeapp
WorkingDirectory=/var/www/myapp
ExecStart=/usr/local/bin/oxmgr start --daemon
ExecStop=/usr/local/bin/oxmgr stop
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable myapp
sudo systemctl start myapp
```

Test it:

```bash
sudo reboot
# After reboot:
ssh server
oxmgr status   # should show running processes
```

**With PM2:**

```bash
pm2 startup    # generates and installs the systemd unit automatically
pm2 save       # saves current process list
```

## Restart vs Reload — The Critical Difference

This confuses everyone at some point:

| Command | What it does | Downtime |
|---------|-------------|---------|
| `oxmgr restart api` | Stops all instances, starts all instances | Brief (~100ms) |
| `oxmgr reload api` | Rolls through instances one at a time | None |
| `pm2 restart api` | Stops all, starts all | Brief |
| `pm2 reload api` | Rolling restart | None |
| `systemctl restart myapp` | Stops, starts | Brief |

**Use `reload` for routine deployments.** Use `restart` only when you need to force a clean state (e.g., after changing env variables that require a full restart).

## The Deploy Script: Combining It All

```bash
#!/bin/bash
set -euo pipefail

APP="${1:-api}"

echo "Deploying $APP..."

# 1. Pull and build
git pull origin main
npm ci --omit=dev
npm run build

# 2. Zero-downtime reload
oxmgr reload "$APP"

# 3. Verify health
echo "Checking health..."
for i in {1..30}; do
  if curl -sf http://localhost:3000/health > /dev/null; then
    echo "Health check passed"
    break
  fi
  [ $i -eq 30 ] && { echo "Health check failed!"; exit 1; }
  sleep 1
done

echo "Deploy complete"
oxmgr status
```

Run with:

```bash
./deploy.sh api
```

## When Restart Isn't Enough: Blue-Green

If rolling restarts aren't safe for your app (e.g., database migration that's incompatible with the old code), use blue-green deployment:

1. Start new instances on a different port (green)
2. Wait for green to pass health checks
3. Switch Nginx upstream to green
4. Keep old instances (blue) for rollback
5. After confirming success, stop blue

See the [zero-downtime deployment guide](/blog/zero-downtime-deployment) for the full walkthrough.

## Quick Reference

```bash
# Development: just re-run
Ctrl+C && node server.js

# Production, brief downtime OK
oxmgr restart api

# Production, zero downtime (use this for deployments)
oxmgr reload api

# Automatic on crash (configure once, forget)
# → set restart_on_exit = true in oxfile.toml

# Automatic on boot (configure once, forget)
sudo systemctl enable myapp
```

Install Oxmgr and stop restarting servers manually:

```bash
npm install -g oxmgr
```

See the [production deployment guide](/blog/how-to-deploy-nodejs-production) for the complete setup.
