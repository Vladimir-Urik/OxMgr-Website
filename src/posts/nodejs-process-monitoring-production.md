---
title: How to Monitor Node.js Processes in Production
description: A complete guide to monitoring Node.js processes in production — CPU, memory, crash alerts, health checks, and the tools that actually matter when something goes wrong at 3am.
date: 2026-04-15
tags: [monitoring, node.js, production, devops, observability]
keywords: [node.js process monitoring, monitor node.js production, node.js cpu memory monitoring, node.js health monitoring, process monitoring linux, node.js alerts production, monitor node.js app, node.js observability]
author: Oxmgr Team
---

When your Node.js app crashes at 3am, there are two scenarios: you find out when a user complains, or your monitoring finds out first and restarts the process before anyone notices.

This guide covers the monitoring stack that matters — from basic process-level metrics to application-level observability.

## What to Monitor

Not all monitoring is equal. Start with what actually causes incidents:

**Process-level:**
- Is the process alive?
- CPU usage (sustained high = bug, spike = expected load)
- Memory usage (gradual growth = memory leak)
- Restart count (frequent restarts = crash loop)
- Uptime (low uptime = instability)

**Application-level:**
- HTTP response time (p50, p95, p99)
- Error rate (5xx responses)
- Request throughput
- Database query latency
- Queue depth (if applicable)

**Infrastructure-level:**
- Disk space (logs can fill it)
- Network I/O
- File descriptor count (open connections)

Start with process-level. It's free and catches most incidents.

## Process-Level Monitoring with Oxmgr

Oxmgr exposes live process metrics via the CLI:

```bash
oxmgr status
```

```
NAME      PID    STATUS    CPU    MEM      RESTARTS  UPTIME
api       14892  running   2.1%   128 MB   0         3d 14h
worker    14901  running   0.3%   64 MB    2         2d 8h
scheduler 14910  running   0.0%   48 MB    0         3d 14h
```

For continuous monitoring, pipe to `watch`:

```bash
watch -n 2 oxmgr status
```

For scripted alerting, use `oxmgr status --json`:

```bash
oxmgr status --json | jq '.[] | select(.restarts > 5)'
```

Configure automatic restarts and restart limits in `oxfile.toml`:

```toml
[processes.api]
command = "node dist/server.js"
restart_on_exit = true
restart_delay_ms = 1000   # wait 1s before restarting
max_restarts = 10          # stop after 10 restarts (crash loop protection)

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30
timeout_secs = 5
unhealthy_threshold = 3   # restart after 3 consecutive failures
```

When `max_restarts` is hit, Oxmgr stops restarting and alerts you via the status command rather than thrashing the system.

## Exposing Metrics from Your App

Your application should expose its own metrics. The most portable format is **Prometheus** — a pull-based metrics system that almost every monitoring tool understands.

Install `prom-client`:

```bash
npm install prom-client
```

Add a `/metrics` endpoint:

```javascript
import express from 'express';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

const app = express();

// Collect default Node.js metrics (event loop lag, GC, heap, etc.)
collectDefaultMetrics();

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections'
});

// Middleware to record metrics
app.use((req, res, next) => {
  const start = Date.now();
  activeConnections.inc();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;

    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    httpRequestTotal.inc(
      { method: req.method, route, status_code: res.statusCode }
    );
    activeConnections.dec();
  });

  next();
});

// Metrics endpoint (restrict access in production)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3000);
```

The default metrics alone give you: heap size, GC pause times, event loop lag, open file descriptors, and active handles — everything you need to spot memory leaks and event loop blocking.

## Health Check Endpoint

Every monitored app needs a `/health` endpoint. This is different from `/metrics` — health is a binary ready/not-ready signal; metrics are time-series data.

```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version,
    checks: {}
  };

  // Check database connection
  try {
    await db.raw('SELECT 1');
    health.checks.database = { status: 'ok' };
  } catch (err) {
    health.checks.database = { status: 'error', message: err.message };
    health.status = 'degraded';
  }

  // Check Redis
  try {
    await redis.ping();
    health.checks.redis = { status: 'ok' };
  } catch (err) {
    health.checks.redis = { status: 'error', message: err.message };
    // Decide if Redis failure makes the whole app unhealthy
  }

  // Check memory (warn if >80% of limit)
  const used = process.memoryUsage().heapUsed;
  const total = process.memoryUsage().heapTotal;
  const ratio = used / total;
  health.checks.memory = {
    status: ratio > 0.9 ? 'warning' : 'ok',
    usedMB: Math.round(used / 1024 / 1024),
    totalMB: Math.round(total / 1024 / 1024),
    ratio: ratio.toFixed(2)
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

## Alerting Without a Full Stack

If you don't have Prometheus + Grafana + Alertmanager yet, you can get process-level alerts with a simple bash script and a cron job.

**Restart count alert:**

```bash
#!/bin/bash
# /usr/local/bin/check-processes.sh

WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
RESTART_THRESHOLD=5

oxmgr status --json | jq -c '.[]' | while read -r process; do
  name=$(echo "$process" | jq -r '.name')
  restarts=$(echo "$process" | jq -r '.restarts')
  status=$(echo "$process" | jq -r '.status')

  if [ "$status" != "running" ]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H 'Content-type: application/json' \
      -d "{\"text\": \"🔴 Process *$name* is *$status* — check immediately\"}"
  elif [ "$restarts" -gt "$RESTART_THRESHOLD" ]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H 'Content-type: application/json' \
      -d "{\"text\": \"⚠️ Process *$name* has restarted *$restarts* times\"}"
  fi
done
```

Add to cron to run every minute:

```bash
* * * * * /usr/local/bin/check-processes.sh
```

## Monitoring Memory Leaks

Memory leaks in Node.js are subtle — the heap grows slowly, performance degrades, eventually the process crashes with `FATAL ERROR: Reached heap limit`.

Watch the trend, not the absolute number:

```bash
# Log memory every minute
while true; do
  echo "$(date) $(oxmgr status --json | jq '.[] | select(.name=="api") | .memory')"
  sleep 60
done >> /var/log/api-memory.log
```

If memory grows by more than 10-20 MB/hour without traffic growth, you have a leak.

**Node.js heap snapshot for investigation:**

```javascript
import { writeHeapSnapshot } from 'node:v8';
import { createServer } from 'node:http';

// Add a diagnostic endpoint (protect with auth in production)
app.get('/debug/heap', (req, res) => {
  const filename = writeHeapSnapshot();
  res.json({ filename, size: fs.statSync(filename).size });
});
```

Load the snapshot in Chrome DevTools → Memory → Load to find what's holding references.

## Event Loop Lag Monitoring

A blocked event loop means Node.js can't process new requests. Requests pile up, latency spikes, and the app appears frozen while technically running.

```javascript
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// Log every 30 seconds
setInterval(() => {
  const lag = histogram.mean / 1e6; // convert nanoseconds to milliseconds

  if (lag > 100) {
    console.error(`Event loop lag: ${lag.toFixed(1)}ms — INVESTIGATE`);
  } else if (lag > 10) {
    console.warn(`Event loop lag: ${lag.toFixed(1)}ms`);
  }

  histogram.reset();
}, 30_000);
```

Event loop lag above 100ms usually means:
- Synchronous work in request handlers (JSON.parse on huge payloads, regex on long strings)
- Blocking I/O on the main thread
- CPU-intensive computation that should be in a worker thread

## Log-Based Monitoring

Structured logs are cheap, searchable, and work everywhere. Use JSON:

```javascript
const log = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'info', msg, ...data, ts: Date.now() })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'error', msg, ...data, ts: Date.now() })),
  warn: (msg, data = {}) => console.warn(JSON.stringify({ level: 'warn', msg, ...data, ts: Date.now() }))
};

// In request handler
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip
    });
  });
  next();
});
```

Pipe logs to `journald` via Oxmgr:

```toml
[processes.api]
command = "node dist/server.js"
log_file = "/var/log/api/app.log"
error_log_file = "/var/log/api/error.log"
```

Then query with:

```bash
# Last 100 errors
grep '"level":"error"' /var/log/api/app.log | tail -100 | jq .

# Requests slower than 500ms
cat /var/log/api/app.log | jq 'select(.durationMs > 500)'
```

## Summary

A minimum viable monitoring setup for a production Node.js app:

1. **Process health** — Oxmgr status, restart limits, `max_restarts`
2. **Health endpoint** — `/health` that checks real dependencies
3. **Prometheus metrics** — `prom-client` with default metrics + custom request metrics
4. **Structured JSON logs** — searchable, parseable, cheap
5. **Restart alerts** — cron script or process manager webhook

This baseline catches 90% of production incidents before users do. Add Grafana dashboards and proper alerting when traffic justifies the operational overhead.

See the [Oxmgr health check docs](/docs#health-checks) for the full health check configuration reference.
