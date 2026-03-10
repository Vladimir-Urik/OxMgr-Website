---
title: Health Checks for Node.js Apps — What They Are, Why They Matter, and How to Build Them
description: Learn what health checks are, how to implement a production-grade /health endpoint in Node.js, and how process managers and load balancers use them to keep your app online.
date: 2026-03-21
tags: [node.js, health-checks, monitoring, production, devops]
keywords: [node.js health check, health check endpoint node.js, /health endpoint, kubernetes health check node.js, liveness probe, readiness probe, http health check, process manager health check, node.js monitoring]
author: Oxmgr Team
---

# Health Checks for Node.js Apps

A health check is how your infrastructure answers the question: *"Is this instance actually working right now?"*

Without one, a load balancer will happily route traffic to an instance whose database connection pool is exhausted, whose memory is full, or whose app started but can't reach any external services. The process is running — but it's not healthy.

Health checks fix this by giving infrastructure a reliable signal to act on.

## Who Uses Health Checks

Three pieces of infrastructure rely on your health endpoint:

**Process managers** (Oxmgr, PM2) — use health checks to determine when a newly spawned process is ready to receive traffic during rolling restarts. Without this, the manager might route traffic to a process that started but isn't ready.

**Load balancers** (Nginx, HAProxy, AWS ALB) — poll health endpoints continuously. If an instance fails, the load balancer stops routing to it and marks it as down.

**Container orchestrators** (Kubernetes, ECS) — use liveness probes (is it running?) and readiness probes (is it ready for traffic?) to decide when to restart containers or route traffic.

## The Minimal Health Endpoint

At minimum, a health check returns 200 when the app is serving requests:

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

This is better than nothing — it confirms the process is alive and Express is responding — but it doesn't tell you if the app can actually do useful work.

## A Production-Grade Health Check

A real health check verifies that dependencies are reachable:

```javascript
import express from 'express';
import { pool } from './db.js';
import { redis } from './cache.js';

const app = express();

app.get('/health', async (req, res) => {
  const start = Date.now();
  const checks = {};
  let overallStatus = 'ok';

  // 1. Database check
  try {
    await pool.query('SELECT 1');
    checks.database = { status: 'ok' };
  } catch (err) {
    checks.database = { status: 'error', message: err.message };
    overallStatus = 'degraded';
  }

  // 2. Redis check (if applicable)
  try {
    await redis.ping();
    checks.redis = { status: 'ok' };
  } catch (err) {
    checks.redis = { status: 'error', message: err.message };
    overallStatus = 'degraded';
  }

  // 3. Disk space check (for log-heavy apps)
  // Optional — add if relevant

  const responseTime = Date.now() - start;
  const statusCode = overallStatus === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    checks,
    meta: {
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version ?? 'unknown',
      nodeVersion: process.version,
    }
  });
});
```

Example response when healthy:

```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok" },
    "redis": { "status": "ok" }
  },
  "meta": {
    "pid": 12847,
    "uptime": 3612,
    "responseTime": "4ms",
    "version": "1.3.0",
    "nodeVersion": "v20.11.0"
  }
}
```

When degraded (database unreachable):

```json
{
  "status": "degraded",
  "checks": {
    "database": { "status": "error", "message": "connect ECONNREFUSED 127.0.0.1:5432" },
    "redis": { "status": "ok" }
  },
  "meta": { ... }
}
```

HTTP status code 503 tells the load balancer to stop routing to this instance.

## Liveness vs Readiness

Kubernetes (and good health check design in general) separates two questions:

**Liveness:** Is the process alive and not deadlocked?
- If this fails, restart the container
- Should almost always return 200 (even a degraded app is alive)
- Should never check external dependencies

**Readiness:** Is the process ready to handle traffic?
- If this fails, stop routing traffic to this instance (but don't restart it)
- Should check all dependencies needed to serve requests
- What you typically mean by "health check"

```javascript
// Liveness — just confirms the event loop is running
app.get('/health/live', (req, res) => {
  res.status(200).json({ alive: true });
});

// Readiness — confirms app can serve useful requests
app.get('/health/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.status(200).json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, reason: err.message });
  }
});
```

In Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
```

## Startup Probe

For slow-starting apps (heavy module loading, DB migrations on startup), add a startup probe. This gives the app time to initialize without triggering liveness failures:

```yaml
startupProbe:
  httpGet:
    path: /health/live
    port: 3000
  failureThreshold: 30    # 30 × 10s = 5 minutes to start
  periodSeconds: 10
```

Once the startup probe passes, liveness and readiness probes take over.

## Configuring Health Checks in Oxmgr

Oxmgr uses health checks to gate rolling restarts:

```toml
[processes.api]
command = "node dist/server.js"
instances = 3
restart_on_exit = true

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 10        # poll every 10 seconds
timeout_secs = 5          # fail if no response within 5s
healthy_threshold = 2     # must pass 2 consecutive checks to be considered healthy
unhealthy_threshold = 3   # must fail 3 consecutive checks to be considered unhealthy
```

During a rolling restart, Oxmgr:
1. Starts a new instance
2. Polls the health endpoint every `interval_secs` seconds
3. Waits for `healthy_threshold` consecutive successes
4. Only then stops the old instance and moves to the next

If the new instance never passes health checks, the rollout stops and you get an error report.

## Health Check Anti-Patterns

**Checking things that don't affect request serving:**

```javascript
// Bad — CPU temperature isn't your app's responsibility
checks.cpuTemp = await getCpuTemp();

// Good — check things your app actually needs
checks.database = await checkDatabase();
```

**Slow health checks:**

Your health endpoint should respond in under 100ms. If your database check takes 2 seconds, something's wrong — and more importantly, your load balancer's request will time out.

```javascript
// Add timeouts to dependency checks
const dbCheck = Promise.race([
  pool.query('SELECT 1'),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('DB check timed out')), 1000)
  )
]);
```

**Caching health check results:**

Some teams cache health responses to avoid hammering the database on every poll. The problem: you might serve stale "ok" results while the database is down.

If your database can't handle 1 `SELECT 1` query per 10 seconds, your database has a problem that a health check cache won't fix.

**Making health checks require authentication:**

Health endpoints should be publicly accessible (to load balancers and process managers that don't have credentials). Don't put them behind auth middleware.

```javascript
// Fine for other routes
app.use(authenticate);

// Health endpoint should be registered before auth middleware
app.get('/health', healthHandler);
app.use(authenticate);
app.get('/api/...', ...);
```

Or use a separate server:

```javascript
// Main app on 3000
app.listen(3000);

// Health check on 3001 — no auth, internal network only
const healthApp = express();
healthApp.get('/health', healthHandler);
healthApp.listen(3001);
```

## Nginx Load Balancer Configuration

Configure Nginx to use your health endpoint:

```nginx
upstream api {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;

    # Nginx Plus / open-source with health_check module
    # health_check interval=10s fails=3 passes=2 uri=/health;
}

server {
    listen 80;

    location / {
        proxy_pass http://api;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 3;
    }
}
```

For active health checking with Nginx (requires Nginx Plus or the `ngx_http_upstream_module`):

```nginx
upstream api {
    zone api 64k;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}

match api_health {
    status 200;
    header Content-Type ~ application/json;
    body ~ '"status":"ok"';
}

server {
    location / {
        proxy_pass http://api;
        health_check interval=10 fails=3 passes=2 uri=/health match=api_health;
    }
}
```

## Testing Your Health Check

```bash
# Basic test
curl -i http://localhost:3000/health

# Test with timeout (simulates load balancer poll)
curl -i --max-time 5 http://localhost:3000/health

# Continuous polling (simulates process manager)
watch -n 2 'curl -s http://localhost:3000/health | jq .'

# Test what happens when DB is down
# Stop your database, then:
curl -i http://localhost:3000/health
# Should return 503
```

## Summary

A production health check should:
- Return 200 only when the app can actually serve requests
- Return 503 when dependencies are unavailable
- Respond in under 100ms
- Be accessible without authentication
- Check real dependencies (database, cache) — not just process liveness
- Expose useful metadata (version, uptime, PID)

Wire it into your process manager, load balancer, and deployment pipeline — and your infrastructure will know exactly when your app is ready and when it isn't.

See the [Oxmgr docs](/docs#health-checks) for process manager health check configuration.
