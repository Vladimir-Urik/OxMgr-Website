---
title: Node.js Clustering — How to Use All CPU Cores in Production
description: Node.js runs on a single thread by default. Learn how to use the cluster module, worker threads, and process managers to run across all CPU cores and multiply your throughput.
date: 2026-03-15
tags: [node.js, clustering, performance, production, multi-core]
keywords: [node.js clustering, node.js cluster module, node.js multi-core, node.js multiple cpu cores, pm2 cluster mode, node.js horizontal scaling, node.js performance production, cluster mode node.js]
author: Oxmgr Team
---

# Node.js Clustering — How to Use All CPU Cores in Production

Node.js runs on a single thread. That's not a bug — it's a deliberate design decision that makes async I/O simple. But it means that by default, a Node.js process uses exactly one CPU core, no matter how many your server has.

On a 4-core VPS, three quarters of your compute is sitting idle.

Clustering fixes this.

## What Clustering Means

Clustering in Node.js means running multiple instances of your application — one per CPU core — all sharing the same port. Incoming connections are distributed across instances by the OS.

```
                    ┌──────────────────────────┐
                    │        Port 3000          │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
         ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
         │ Worker 0 │        │ Worker 1 │        │ Worker 2 │
         │ (PID 101)│        │ (PID 102)│        │ (PID 103)│
         └──────────┘        └──────────┘        └──────────┘
              │                  │                   │
         CPU Core 0         CPU Core 1          CPU Core 2
```

Each worker is an independent Node.js process with its own event loop, memory heap, and V8 instance. They share no state in-memory — only the listening port.

## Option 1: The Cluster Module (Built-in)

Node.js ships with a `cluster` module that handles forking and connection distribution:

```javascript
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { createServer } from 'node:http';

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  console.log(`Primary ${process.pid} running, forking ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (${signal || code}), restarting...`);
    cluster.fork(); // auto-restart crashed workers
  });

} else {
  // Each worker runs this
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end(`Handled by worker ${process.pid}`);
  });

  server.listen(3000, () => {
    console.log(`Worker ${process.pid} started`);
  });
}
```

With Express:

```javascript
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import express from 'express';

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died, restarting`);
    cluster.fork();
  });

} else {
  const app = express();

  app.get('/', (req, res) => {
    res.json({ pid: process.pid, message: 'Hello from worker' });
  });

  app.listen(3000);
}
```

**Pros of the cluster module:**
- No external dependencies
- Full control over fork behavior
- Can pass messages between primary and workers via IPC

**Cons:**
- Boilerplate in every project
- You manage restarts yourself
- No visibility into worker health from outside the process

## Option 2: Let the Process Manager Handle It

The cleaner approach: keep your app code simple and let the process manager handle clustering.

With **Oxmgr**, set `instances` in `oxfile.toml`:

```toml
[processes.api]
command = "node dist/server.js"
instances = 4          # explicit count
restart_on_exit = true

# Or use CPU count automatically:
# instances = "max"
```

Your application code has no clustering logic — it's just a regular Express/Fastify/Hapi app listening on a port. Oxmgr forks it `instances` times and distributes connections.

With **PM2**:

```bash
pm2 start app.js -i max     # max = number of CPU cores
pm2 start app.js -i 4       # explicit
```

Or in `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'api',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster'
  }]
}
```

**Why this approach is better:**
- Clean separation of concerns — app doesn't know about clustering
- Process manager handles crashes across all instances
- Zero-downtime rolling restarts work across all instances
- Health checks monitor each instance independently

## Option 3: Worker Threads

Don't confuse clustering with Worker Threads. They're different tools for different problems:

| | Cluster | Worker Threads |
|--|---------|----------------|
| Purpose | Scale I/O-bound workloads across cores | Run CPU-intensive tasks off the main thread |
| Memory | Separate heap per process | Shared memory available (`SharedArrayBuffer`) |
| Communication | IPC (slower) | `postMessage` or shared buffers (faster) |
| Failure isolation | One crash = one process | One crash = entire process |
| Use case | Web servers, API handlers | Image processing, crypto, data parsing |

Use clusters for serving HTTP. Use Worker Threads for CPU-heavy operations within a single process.

```javascript
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

if (isMainThread) {
  // Main thread: handle HTTP, delegate heavy work
  const worker = new Worker('./heavy-computation.js');
  worker.postMessage({ data: bigArray });
  worker.on('message', (result) => {
    console.log('Computation result:', result);
  });
} else {
  // Worker thread: do the heavy lifting
  parentPort.on('message', ({ data }) => {
    const result = doExpensiveComputation(data);
    parentPort.postMessage(result);
  });
}
```

## How Many Instances Should You Run?

The common advice is "one per CPU core." This is right for CPU-bound workloads. For I/O-bound Node.js apps (which is most of them), the relationship is more nuanced.

**CPU-bound apps** (heavy computation, data processing):
- One instance per physical core
- More instances than cores = context switching overhead

**I/O-bound apps** (database queries, HTTP calls, file reads):
- Start with one per core
- Benchmark under load — you might get better results with fewer instances sharing more memory
- The bottleneck is usually the database, not the CPU

**Practical starting point:**

```toml
[processes.api]
# 2-core VPS
instances = 2

# 4-core server
instances = 4

# Leave one core for the OS and other processes
# instances = 3  (on a 4-core machine under heavy load)
```

Monitor CPU and memory under load. If workers are CPU-saturated (consistently >80%), adding instances helps. If they're mostly idle waiting for DB queries, more instances just means more memory usage.

## Sticky Sessions and Shared State

Clustering breaks any in-memory session state. If user A hits Worker 0 on request 1 and Worker 1 on request 2, Worker 1 doesn't know about Worker 0's session data.

Solutions:

**1. Use a shared session store (recommended):**

```javascript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
```

**2. Use sticky sessions (not recommended for new projects):**

Sticky sessions route each client to the same worker consistently via a cookie or IP hash. This defeats the purpose of load balancing and creates uneven distribution.

**3. Design stateless services:**

The best approach for clustered apps: keep no state in memory. Use Redis, a database, or JWT tokens instead. Your app becomes trivially scalable — from 1 to 100 instances with no code changes.

## Graceful Reloads with Clustering

When you update your app, you want to restart workers without dropping connections. This is the rolling restart pattern:

```
Worker 0: SIGTERM → drain connections → exit
                         ↓
                    New Worker 0 starts → health check passes
Worker 1: SIGTERM → drain connections → exit
                         ↓
                    New Worker 1 starts → health check passes
```

With Oxmgr:

```bash
oxmgr reload api
```

This performs a rolling restart across all instances. If a new instance fails its health check, the reload stops and old instances keep running — automatic rollback.

## Quick Performance Test

Before and after enabling clustering:

```bash
# Install autocannon
npm install -g autocannon

# Benchmark single process (instances = 1)
autocannon -c 100 -d 10 http://localhost:3000

# Enable clustering (instances = 4), restart, benchmark again
autocannon -c 100 -d 10 http://localhost:3000
```

On a CPU-bound workload, you should see throughput multiply roughly linearly with core count. On an I/O-bound workload with a fast database, the gains are less dramatic but still meaningful.

## Summary

- Node.js is single-threaded by default — clustering uses all CPU cores
- **Simple apps:** use `instances` in your process manager config
- **Complex apps:** consider the built-in cluster module for fine-grained control
- **CPU-heavy tasks:** use Worker Threads within a process, not more cluster instances
- Always use shared state storage (Redis) — in-memory state doesn't survive across workers
- Process managers handle the hard parts: restarts, health checks, rolling reloads

See the [Oxmgr docs](/docs) for cluster configuration, or the [deployment guide](/blog/how-to-deploy-nodejs-production) for the full production setup walkthrough.
