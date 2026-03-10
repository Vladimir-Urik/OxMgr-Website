---
title: Zero-Downtime Deployment — How to Deploy Without Dropping a Single Request
description: A practical guide to zero-downtime deployments for Node.js apps. Covers rolling restarts, blue-green deployments, graceful shutdowns, and health check–driven deploys — with real examples.
date: 2026-03-18
tags: [deployment, zero-downtime, node.js, devops, rolling-restart]
keywords: [zero downtime deployment, zero downtime deploy node.js, rolling restart, blue green deployment, graceful shutdown node.js, pm2 reload zero downtime, node.js deploy without downtime, production deployment node.js]
author: Oxmgr Team
---

# Zero-Downtime Deployment

Every time you deploy, you have a choice: take the app down briefly or keep it up. For most production systems, downtime — even 5 seconds — is unacceptable.

This guide covers the techniques that make zero-downtime deployments possible, from the simplest single-server setup to multi-server strategies.

## Why Deployments Cause Downtime

The naive deploy sequence looks like this:

```bash
# Bad — causes downtime
pm2 stop api
git pull
npm run build
pm2 start api
```

Between `stop` and the new process starting and passing health checks, your app is down. Connections get refused. Users see errors. Load balancers fail health checks and trigger alerts.

Even if the downtime is 2 seconds, it shows up in your error rate and p99 latency graphs.

## The Three Prerequisites

Zero-downtime deployment requires three things from your application:

**1. Graceful shutdown** — the app must finish in-flight requests before exiting. If it doesn't, requests that hit the dying instance get cut off.

**2. Fast startup** — the new instance must be able to pass health checks quickly. An app that takes 30 seconds to initialize creates a 30-second window of reduced capacity.

**3. Stateless design** — if session state lives in-memory, it dies with the process. Use Redis or a database for state so any instance can handle any request.

## Implementing Graceful Shutdown

This is non-negotiable. Your app must handle SIGTERM:

```javascript
import express from 'express';
import { createServer } from 'node:http';

const app = express();
const server = createServer(app);

// Track active connections
const connections = new Set();
server.on('connection', (socket) => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid });
});

app.get('/', (req, res) => {
  // Simulate some work
  setTimeout(() => res.json({ hello: 'world' }), 100);
});

server.listen(3000, () => {
  console.log(`Worker ${process.pid} listening on :3000`);
});

// Graceful shutdown handler
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }

    // All connections closed — safe to exit
    console.log('Server closed. Exiting.');
    process.exit(0);
  });

  // Destroy idle connections immediately
  // (active connections will close after request completes)
  for (const socket of connections) {
    socket.destroy();
  }

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

Test your graceful shutdown:

```bash
# Start the app, note the PID
node server.js &
PID=$!

# Send a slow request
curl http://localhost:3000/ &

# Immediately send SIGTERM
kill $PID

# The slow request should still complete
# The server should exit cleanly after
```

## Rolling Restart

A rolling restart replaces instances one-by-one rather than all at once. While one instance shuts down gracefully, the others continue serving traffic. When the new instance passes health checks, the next old instance shuts down.

```
Step 1: [Worker 0: old] [Worker 1: old] [Worker 2: old]
                                                       ↓ (start new Worker 0)
Step 2: [Worker 0: NEW] [Worker 1: old] [Worker 2: old]   ← health check passes
                                         ↓ (stop old Worker 1, start new Worker 1)
Step 3: [Worker 0: NEW] [Worker 1: NEW] [Worker 2: old]   ← health check passes
                                                       ↓ (stop old Worker 2)
Step 4: [Worker 0: NEW] [Worker 1: NEW] [Worker 2: NEW]   ← deploy complete
```

With Oxmgr:

```bash
# After pulling new code and building
oxmgr reload api
```

Oxmgr handles the rollout automatically. If any new instance fails its health check, the rollout stops and remaining instances keep running the old code. You can rollback manually or fix the issue and re-deploy.

Configure the health check that guards each step:

```toml
[processes.api]
command = "node dist/server.js"
instances = 3
restart_on_exit = true

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 2       # check frequently during rollout
timeout_secs = 5
healthy_threshold = 2   # must pass 2 consecutive checks
```

With PM2:

```bash
pm2 reload api    # rolling restart
# NOT: pm2 restart api  (that restarts all at once)
```

## Blue-Green Deployment

Blue-green keeps two complete environments — "blue" (current) and "green" (new). You deploy to green while blue serves traffic, then switch.

```
                    Load Balancer
                         │
              ┌──────────┴──────────┐
              │                     │
           [BLUE]                [GREEN]
       (running v1.2)        (running v1.3)
        ← serving traffic     ← being deployed to
```

When green is ready and passes health checks, flip the load balancer. Rollback = flip back to blue.

**Nginx upstream swap:**

```nginx
# /etc/nginx/conf.d/upstream.conf
# Before deploy: points to blue
upstream api {
    server 127.0.0.1:3000;    # blue
}

# After deploy: points to green
upstream api {
    server 127.0.0.1:3001;    # green
}
```

```bash
# Deploy to green (port 3001)
PORT=3001 oxmgr start --config oxfile.green.toml

# Wait for green health check
until curl -sf http://localhost:3001/health; do sleep 1; done

# Swap nginx upstream
sed -i 's/3000/3001/' /etc/nginx/conf.d/upstream.conf
nginx -s reload

# Old blue is now free — keep it warm for rollback
```

**Trade-offs:**
- ✓ Instant rollback (flip the load balancer back)
- ✓ No in-flight requests lost during the switch
- ✗ Requires 2× the resources during deployment
- ✗ More complex setup

## The Deploy Script

A production-grade deploy script that combines rolling restart with automatic rollback:

```bash
#!/bin/bash
set -euo pipefail

APP="api"
HEALTH_URL="http://localhost:3000/health"
MAX_WAIT=60

echo "=== Deploy started at $(date) ==="

# 1. Pull latest code
echo "Pulling code..."
git fetch origin main
git reset --hard origin/main

# 2. Install dependencies if lockfile changed
if git diff HEAD@{1} --name-only | grep -q "package-lock.json"; then
  echo "Installing dependencies..."
  npm ci --omit=dev
fi

# 3. Build
echo "Building..."
npm run build

# 4. Rolling restart
echo "Reloading processes..."
if ! oxmgr reload $APP; then
  echo "ERROR: Reload failed. Checking if old version still running..."
  oxmgr status
  exit 1
fi

# 5. Verify health
echo "Waiting for health check..."
for i in $(seq 1 $MAX_WAIT); do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "Health check passed after ${i}s"
    break
  fi
  if [ $i -eq $MAX_WAIT ]; then
    echo "ERROR: Health check failed after ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
done

echo "=== Deploy complete ==="
oxmgr status
```

Make it executable and run it:

```bash
chmod +x deploy.sh
./deploy.sh
```

## Health Check Endpoint

Your `/health` endpoint is the single most important endpoint in your app for deployments. Make it useful:

```javascript
app.get('/health', async (req, res) => {
  const checks = {};
  let healthy = true;

  // Check database
  try {
    await db.query('SELECT 1');
    checks.database = 'ok';
  } catch (err) {
    checks.database = 'error';
    healthy = false;
  }

  // Check Redis (if used)
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (err) {
    checks.redis = 'error';
    // Decide if Redis failure = unhealthy for your app
  }

  // Return version and uptime for visibility
  checks.version = process.env.npm_package_version;
  checks.uptime = process.uptime();
  checks.pid = process.pid;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks
  });
});
```

The process manager polls this endpoint. If it returns non-200, the new instance is considered unhealthy and the rolling restart stops.

## Common Mistakes

**Killing the process before requests complete:**

```bash
# Wrong — kills immediately
pm2 restart api

# Right — waits for in-flight requests
pm2 reload api
oxmgr reload api
```

**Not handling SIGTERM in the app:**

Without a SIGTERM handler, Node.js exits immediately when the process manager sends the graceful shutdown signal. In-flight requests get cut off.

**Health endpoint that always returns 200:**

```javascript
// Wrong — returns 200 even when broken
app.get('/health', (req, res) => res.json({ ok: true }));

// Right — actually checks dependencies
app.get('/health', async (req, res) => {
  const dbOk = await checkDatabase();
  res.status(dbOk ? 200 : 503).json({ database: dbOk ? 'ok' : 'error' });
});
```

**Deploying with `npm install` instead of `npm ci`:**

`npm install` can silently update packages. `npm ci` installs exactly what's in `package-lock.json`. Always use `npm ci` in production deploys.

## Summary

Zero-downtime deployment requires three things:
1. **Graceful shutdown** in your app code (handle SIGTERM)
2. **Rolling restart** from your process manager (`oxmgr reload`, not `restart`)
3. **Health checks** that accurately reflect whether the app is ready

With this in place, deploys become invisible to users — no connection errors, no 502s, no alert storms at 2am.

See the [Oxmgr docs](/docs) for health check configuration and the [deployment guide](/blog/how-to-deploy-nodejs-production) for the full setup.
