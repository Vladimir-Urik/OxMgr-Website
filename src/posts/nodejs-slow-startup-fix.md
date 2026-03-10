---
title: Why Your Node.js App Is Slow to Start (And How to Fix It)
description: Diagnose and fix slow Node.js startup times. Covers module loading bottlenecks, database connection overhead, migration blocking, health check timing, and practical profiling techniques.
date: 2026-05-12
tags: [node.js, performance, startup, optimization, production]
keywords: [node.js slow startup, node.js startup time, node.js boot time optimization, node.js slow to start, node.js startup performance, optimize node.js startup, node.js require time, node.js initialization slow]
author: Oxmgr Team
---

A Node.js app that takes 30 seconds to start is a problem. Every deploy, every restart, every crash recovery means 30 seconds of reduced capacity or downtime.

Slow startup comes from a handful of predictable causes. This guide covers how to find them and fix them.

## Why Startup Time Matters

During a rolling restart, Oxmgr starts the new instance and waits for it to pass health checks before stopping the old one. A slow startup means:

- Longer window where you're running fewer instances (reduced capacity)
- Health check `initial_delay_secs` needs to be high enough to cover startup time
- A crashed app stays down longer before recovery is complete

11ms crash recovery vs 410ms is the difference between users noticing and not noticing. Startup time affects recovery time proportionally.

## Measuring Startup Time

Before optimizing, measure:

```bash
time node dist/server.js &
# In another terminal, poll until health check passes
until curl -sf http://localhost:3000/health; do sleep 0.1; done; echo "Ready"
```

Or instrument directly in code:

```javascript
const startTime = performance.now();

// ... all your initialization ...

server.listen(3000, () => {
  const readyTime = performance.now() - startTime;
  console.log(`Ready in ${readyTime.toFixed(0)}ms (pid ${process.pid})`);
});
```

Run a few times, take the median. Now you have a baseline.

## Profiling What's Slow

### `--prof` — V8 CPU Profiler

```bash
node --prof dist/server.js &
sleep 5  # let it start
kill $!

# Process the profile
node --prof-process isolate-*.log > startup-profile.txt
head -100 startup-profile.txt
```

Look for `[Bottom up (heavy) profile]` — the functions consuming the most time.

### Startup Profiler

For a higher-level view, use the `startup-profiler` approach:

```javascript
// startup-timer.js — instrument your imports
const times = new Map();

const _require = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  const start = performance.now();
  const result = _require.call(this, request, parent, isMain, options);
  const elapsed = performance.now() - start;
  if (elapsed > 1) {
    times.set(request, (times.get(request) || 0) + elapsed);
  }
  return result;
};

process.on('exit', () => {
  const sorted = [...times.entries()].sort((a, b) => b[1] - a[1]);
  console.log('\n=== Slow requires ===');
  for (const [mod, ms] of sorted.slice(0, 20)) {
    console.log(`${ms.toFixed(0)}ms  ${mod}`);
  }
});
```

```bash
node -r ./startup-timer.js dist/server.js
```

Or use the `clinic` tool:

```bash
npm install -g clinic
clinic doctor -- node dist/server.js
```

## The Common Causes

### 1. Expensive Module Imports

Some modules do work at import time — parsing large files, running initialization code, connecting to services.

```bash
# Find the slowest imports
node --require perf_hooks --eval "
const { performance, PerformanceObserver } = require('perf_hooks');
const Module = require('module');
const orig = Module._load;
const times = {};
Module._load = function(req, ...args) {
  const start = performance.now();
  const result = orig.call(this, req, ...args);
  times[req] = (times[req] || 0) + (performance.now() - start);
  return result;
};
process.on('exit', () => {
  Object.entries(times).sort((a,b) => b[1]-a[1]).slice(0,15).forEach(([m,t]) =>
    console.log(t.toFixed(1).padStart(8) + 'ms  ' + m));
});
" -r ./dist/server.js 2>&1 | head -30
```

**Fix:** Lazy-load modules that aren't needed at startup:

```javascript
// Before: imported at top (loads sharp at startup)
import sharp from 'sharp';

// After: imported on first use (loads sharp only when needed)
let sharp;
async function processImage(buffer) {
  if (!sharp) {
    sharp = (await import('sharp')).default;
  }
  return sharp(buffer).resize(800, 600).toBuffer();
}
```

For TypeScript/ESM:

```javascript
// Eager import — always loaded
import { createPool } from 'mysql2/promise';

// Lazy import — only loaded when first called
const getPool = (() => {
  let pool;
  return async () => {
    if (!pool) {
      const { createPool } = await import('mysql2/promise');
      pool = createPool({ /* config */ });
    }
    return pool;
  };
})();
```

### 2. Blocking Database Connections

Opening a database connection pool at startup blocks until connections are established:

```javascript
// Slow: waits for database before being ready
const pool = await createPool({ host: 'localhost', /* ... */ });
await pool.query('SELECT 1'); // verify connection
server.listen(3000);
```

If the database is slow to respond, startup is slow.

**Fix:** Connect lazily — start the HTTP server first, connect to databases as needed:

```javascript
// Fast: server is listening immediately
server.listen(3000, () => {
  console.log('HTTP server ready');
  // Connect to database in background
  initializeDatabase().catch(console.error);
});

async function initializeDatabase() {
  pool = await createPool({ host: 'localhost', /* ... */ });
  console.log('Database connected');
}
```

Your health check should return `503` until the database is connected:

```javascript
let dbConnected = false;

app.get('/health', (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ status: 'starting', database: 'connecting' });
  }
  res.json({ status: 'ok' });
});
```

Oxmgr waits for a `200` health check before considering the instance healthy. The rolling restart won't proceed until the database is connected.

### 3. Running Migrations at Startup

A common pattern — run database migrations before starting the server:

```javascript
// Slow: migrations can take 30+ seconds on large databases
await runMigrations();
server.listen(3000);
```

**Fix:** Run migrations in a separate step before starting the app:

```bash
# deploy.sh
node dist/migrate.js   # run migrations first
oxmgr reload api       # then rolling restart the app
```

```toml
# oxfile.toml — migration as a separate one-shot process
[processes.migrate]
command = "node dist/migrate.js"
restart_on_exit = false   # run once, don't restart
```

If migrations must run in the app, run them asynchronously and gate readiness:

```javascript
let migrationsComplete = false;

app.get('/health', (req, res) => {
  if (!migrationsComplete) {
    return res.status(503).json({ status: 'migrating' });
  }
  res.json({ status: 'ok' });
});

server.listen(3000, async () => {
  await runMigrations();
  migrationsComplete = true;
  console.log('Migrations complete — accepting traffic');
});
```

### 4. Reading Large Config Files or Assets

Reading large files synchronously at startup:

```javascript
// Slow: reads potentially large files synchronously
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const translations = JSON.parse(fs.readFileSync('./i18n/all.json', 'utf8'));
```

**Fix:** Use async reads, or pre-bundle into the application:

```javascript
// Async reads — don't block the event loop
const [config, translations] = await Promise.all([
  fs.promises.readFile('./config.json', 'utf8').then(JSON.parse),
  fs.promises.readFile('./i18n/all.json', 'utf8').then(JSON.parse)
]);
```

Or better — bundle config into the JavaScript at build time so there's no file I/O at startup.

### 5. Warming Up Too Much

Some apps pre-compile templates, warm up caches, or pre-generate data at startup:

```javascript
// Loading entire database into memory at startup
const cache = await loadAllProductsIntoMemory();  // 50,000 records = slow
server.listen(3000);
```

**Fix:** Load lazily on first request, with a background refresh:

```javascript
let cache = null;
let cacheRefreshInterval;

async function getCache() {
  if (!cache) {
    cache = await loadProductCache();
    // Refresh cache every 5 minutes in background
    cacheRefreshInterval = setInterval(async () => {
      cache = await loadProductCache();
    }, 5 * 60 * 1000);
  }
  return cache;
}

// First request triggers cache load — subsequent requests are instant
app.get('/products', async (req, res) => {
  const products = await getCache();
  res.json(products);
});
```

### 6. Many Small Synchronous Operations

100 synchronous operations of 1ms each = 100ms of startup time. Hard to spot, easy to fix:

```javascript
// Slow: reads 100 config files one by one
const configs = {};
for (const name of configNames) {
  configs[name] = JSON.parse(fs.readFileSync(`./config/${name}.json`));
}

// Fast: reads all in parallel
const configs = Object.fromEntries(
  await Promise.all(
    configNames.map(async (name) => [
      name,
      JSON.parse(await fs.promises.readFile(`./config/${name}.json`, 'utf8'))
    ])
  )
);
```

## Setting Health Check Timing Correctly

In `oxfile.toml`, match `initial_delay_secs` to your startup time:

```toml
[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 10
initial_delay_secs = 5   # don't check for the first 5s — app is still starting
unhealthy_threshold = 3
```

If your app takes 8 seconds to start and `initial_delay_secs` is 5, Oxmgr will see 3 failing health checks before the app is ready and restart it unnecessarily. Set `initial_delay_secs` to your measured startup time plus 20%.

## Tracking Startup Over Time

Add startup timing to your logs and track it:

```javascript
const PROCESS_START = Date.now();

server.listen(3000, () => {
  const startupMs = Date.now() - PROCESS_START;

  console.log(JSON.stringify({
    level: 'info',
    type: 'startup',
    startupMs,
    pid: process.pid,
    nodeVersion: process.version,
    ts: Date.now()
  }));

  if (startupMs > 5000) {
    console.warn(JSON.stringify({
      level: 'warn',
      type: 'slow-startup',
      startupMs,
      message: 'Startup exceeded 5s threshold'
    }));
  }
});
```

```bash
# Track startup trends from logs
grep '"type":"startup"' /var/log/api/app.log | jq -r '[.ts, .startupMs] | @csv'
```

A sudden jump in startup time often signals a new slow import or initialization step added in a recent commit.

## Startup Optimization Checklist

- [ ] Measured baseline startup time
- [ ] Profiled with `--prof` or startup timer
- [ ] Lazy-load non-critical modules
- [ ] Database connections open lazily (server listens first)
- [ ] Migrations run as a separate step, not in app startup
- [ ] Large file reads are async and parallel
- [ ] `initial_delay_secs` matches measured startup time
- [ ] Startup time tracked in logs

For crash recovery time specifically, the process manager startup overhead is a separate factor from app initialization time. Oxmgr's 38ms startup vs PM2's 1240ms is the manager overhead — your app's initialization time adds on top. See the [Oxmgr vs PM2 benchmark](/blog/oxmgr-vs-pm2-benchmark) for the full numbers.
