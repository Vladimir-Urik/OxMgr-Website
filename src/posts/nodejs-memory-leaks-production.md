---
title: Node.js Memory Leaks in Production — How to Find and Fix Them
description: Memory leaks in Node.js cause gradual slowdowns and eventual crashes. Learn how to detect leaks with heap snapshots, identify the root causes, and fix them — without taking down production.
date: 2026-03-24
tags: [node.js, memory-leak, debugging, production, performance]
keywords: [node.js memory leak, node.js memory leak production, heap snapshot node.js, node.js out of memory, node.js memory usage high, find memory leak node.js, node.js process memory, node.js heap, fix memory leak node.js]
author: Oxmgr Team
---

# Node.js Memory Leaks in Production

Memory leaks are insidious. They don't crash your app immediately — they slow it down gradually until, hours or days later, the process runs out of memory and dies. Then your process manager restarts it, and the cycle repeats.

The symptoms: heap usage that only ever goes up, increasing response times over hours, OOM kills in your logs, and an on-call rotation that wakes up at 3am when the restart happens.

Here's how to find and fix them systematically.

## Understanding Node.js Memory

Before debugging, know what you're looking at:

```bash
# View process memory
node -e "const m = process.memoryUsage(); console.log(JSON.stringify(m, null, 2))"
```

```json
{
  "rss": 45678592,       // Resident Set Size — total memory allocated by the OS
  "heapTotal": 18874368, // Total heap allocated by V8
  "heapUsed": 14237648,  // Heap currently used (what actually matters)
  "external": 1234567,   // Memory used by C++ objects (Buffer, etc.)
  "arrayBuffers": 987654  // Memory allocated for ArrayBuffer/SharedArrayBuffer
}
```

**`heapUsed` is your number.** Watch it over time. Healthy apps have relatively stable heap usage after a warmup period. A leak shows as steady, monotonic growth that never levels off.

## Confirming You Have a Leak

Don't guess. Confirm with data.

Add a memory usage log to your app:

```javascript
// Log memory every 30 seconds
setInterval(() => {
  const { heapUsed, heapTotal, rss } = process.memoryUsage();
  console.log(JSON.stringify({
    type: 'memory',
    timestamp: new Date().toISOString(),
    heapUsedMB: Math.round(heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(heapTotal / 1024 / 1024),
    rssMB: Math.round(rss / 1024 / 1024),
  }));
}, 30_000);
```

Run it under load for 30–60 minutes and watch `heapUsedMB`. If it grows from 150MB to 400MB without stabilizing, you have a leak.

You can also check from outside with Oxmgr:

```bash
oxmgr status --memory
```

## Heap Snapshot Analysis

The definitive way to find a leak: take two heap snapshots — one at baseline and one after heap growth — and compare them.

### Method 1: Node.js Inspector

```bash
# Start with inspector enabled
node --inspect dist/server.js

# Or attach to running process
kill -USR1 <pid>  # enables inspector on running process
```

Open Chrome DevTools → `chrome://inspect` → open dedicated DevTools for Node → Memory tab → Heap snapshot.

Take snapshot 1 at startup. Generate load for 10 minutes. Take snapshot 2. Use the "Comparison" view to see what objects grew.

### Method 2: Programmatic Snapshots

For production servers where you can't use Chrome DevTools:

```javascript
import { writeHeapSnapshot } from 'node:v8';
import { mkdirSync } from 'node:fs';

// Expose via HTTP endpoint (protect this in production!)
app.post('/admin/heap-snapshot', (req, res) => {
  mkdirSync('./heap-snapshots', { recursive: true });
  const filename = writeHeapSnapshot('./heap-snapshots');
  console.log(`Heap snapshot written to ${filename}`);
  res.json({ filename });
});
```

```bash
# Take baseline snapshot
curl -X POST http://localhost:3000/admin/heap-snapshot

# Generate load
autocannon -c 50 -d 120 http://localhost:3000/api/endpoint

# Take second snapshot
curl -X POST http://localhost:3000/admin/heap-snapshot

# Download snapshots for analysis
scp server:~/heap-snapshots/*.heapsnapshot .
```

Open the `.heapsnapshot` files in Chrome DevTools (Memory → Load profile).

### Method 3: `--heapsnapshot-signal`

```bash
# Auto-write snapshot on signal
node --heapsnapshot-signal=SIGUSR2 dist/server.js

# Trigger snapshot from another terminal
kill -USR2 <pid>
```

## Common Causes of Memory Leaks

### 1. Growing Arrays and Maps Never Cleared

The most common leak: you append to a collection but never remove old entries.

```javascript
// LEAK — unbounded growth
const requestLog = [];

app.use((req, res, next) => {
  requestLog.push({ url: req.url, time: Date.now() });
  next();
});

// FIX — cap the size
const MAX_LOG_ENTRIES = 1000;
app.use((req, res, next) => {
  requestLog.push({ url: req.url, time: Date.now() });
  if (requestLog.length > MAX_LOG_ENTRIES) {
    requestLog.shift(); // remove oldest
  }
  next();
});

// OR use a proper circular buffer / time-based expiry
```

### 2. Event Listener Accumulation

Every `emitter.on()` call adds a listener. If you add listeners without removing them, they accumulate.

```javascript
// LEAK — new listener added on every request
app.get('/stream', (req, res) => {
  eventEmitter.on('data', (data) => {
    res.write(data);
  });
});

// FIX — remove listener when connection closes
app.get('/stream', (req, res) => {
  const handler = (data) => res.write(data);
  eventEmitter.on('data', handler);

  req.on('close', () => {
    eventEmitter.off('data', handler);
  });
});
```

Node.js warns about this: `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 data listeners added.`

Take these warnings seriously.

### 3. Closures Holding References

Closures can inadvertently keep large objects in memory:

```javascript
// LEAK — the closure captures the entire 'request' object
function processRequest(request) {
  const bigData = request.body; // 10MB of data

  // This timer keeps bigData alive for 60 seconds
  setTimeout(() => {
    console.log('Processed request from:', request.ip);
  }, 60_000);
}

// FIX — capture only what you need
function processRequest(request) {
  const bigData = request.body;
  const ip = request.ip; // only capture the small string

  setTimeout(() => {
    console.log('Processed request from:', ip);
    // bigData is now eligible for GC
  }, 60_000);
}
```

### 4. Uncleaned Timers and Intervals

```javascript
// LEAK — interval runs forever, holding references
class MyService {
  start() {
    this.interval = setInterval(() => {
      this.doWork();
    }, 1000);
  }

  // FIX — always provide a cleanup method
  stop() {
    clearInterval(this.interval);
  }
}

// LEAK — forgot to clear timeout
const timer = setTimeout(() => {
  doSomething(bigObject);
}, 30_000);

// FIX — clear if no longer needed
clearTimeout(timer);
```

### 5. Cache Without Expiry

In-memory caches that grow without eviction are a classic leak:

```javascript
// LEAK — cache grows forever
const cache = new Map();

async function getData(key) {
  if (cache.has(key)) return cache.get(key);
  const data = await fetchFromDB(key);
  cache.set(key, data);
  return data;
}

// FIX — use a proper LRU cache with size limit
import LRU from 'lru-cache';

const cache = new LRU({
  max: 500,           // max 500 entries
  ttl: 1000 * 60 * 5 // 5 minute TTL
});

// Or clear periodically
setInterval(() => cache.clear(), 60_000 * 60); // hourly
```

### 6. Database Connection Pool Exhaustion

Not a heap leak, but causes similar symptoms:

```javascript
// LEAK — creating a new pool per request
app.get('/data', async (req, res) => {
  const pool = new Pool({ connectionString: DB_URL }); // NEW pool every request
  const result = await pool.query('SELECT * FROM items');
  res.json(result.rows);
  // Pool connections stay open!
});

// FIX — create pool once at startup
const pool = new Pool({ connectionString: DB_URL, max: 20 });

app.get('/data', async (req, res) => {
  const result = await pool.query('SELECT * FROM items');
  res.json(result.rows);
});
```

## Automatic Restart on Memory Limit

While you're hunting the leak, protect production with a memory limit restart:

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
instances = 2
restart_on_exit = true

[processes.api.resource_limits]
max_memory_mb = 512    # restart the process if it exceeds 512MB
```

When the process hits the limit, Oxmgr restarts it gracefully (SIGTERM → wait → SIGKILL if needed). The other instance keeps serving traffic during the restart. This buys you time to fix the leak properly.

With PM2:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'api',
    script: 'dist/server.js',
    max_memory_restart: '512M'
  }]
};
```

## Monitoring Memory in Production

Add memory metrics to your monitoring:

```javascript
import client from 'prom-client';

// Register memory gauge
const heapUsedGauge = new client.Gauge({
  name: 'nodejs_heap_used_bytes',
  help: 'Node.js heap used in bytes',
});

const heapTotalGauge = new client.Gauge({
  name: 'nodejs_heap_total_bytes',
  help: 'Node.js heap total in bytes',
});

// Update every 15 seconds
setInterval(() => {
  const { heapUsed, heapTotal } = process.memoryUsage();
  heapUsedGauge.set(heapUsed);
  heapTotalGauge.set(heapTotal);
}, 15_000);

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

Set up an alert when heap grows by more than 20% over a 30-minute window. That's your early warning before the crash.

## Debugging in Production Safely

Never take a heap snapshot from a high-traffic instance — it pauses the GC and can cause noticeable latency spikes. Instead:

1. Take one instance out of the load balancer rotation
2. Generate controlled load on that instance
3. Take snapshots
4. Analyze
5. Return the instance to rotation

With Oxmgr:

```bash
# Route traffic away from instance 0 for debugging
oxmgr instance api 0 --drain

# Take snapshots, analyze
# ...

# Return to rotation
oxmgr instance api 0 --resume
```

## Summary

Memory leaks in Node.js are always caused by references that live longer than expected. The most common culprits:

1. Unbounded arrays, Maps, or Sets
2. Event listeners not removed when no longer needed
3. Closures capturing large objects
4. Timers and intervals not cleared
5. In-memory caches without eviction

**Fix immediately:** set `max_memory_mb` in your process manager to contain the damage while you investigate.

**Find the leak:** heap snapshots, comparison view in Chrome DevTools, look for objects that grow monotonically between snapshots.

**Fix properly:** trace the reference chain from the leaking objects back to the code that creates them. Remove the reference, add cleanup, or add an eviction policy.

See the [Oxmgr docs](/docs#resource-limits) for memory limit configuration.
