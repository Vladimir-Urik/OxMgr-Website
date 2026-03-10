---
title: Node.js Worker Threads vs Cluster — When to Use Which
description: Worker threads and cluster mode solve different problems. This guide explains when to use each, how they interact with process managers, and how to get the most out of multi-core CPUs in Node.js.
date: 2026-04-24
tags: [node.js, worker-threads, cluster, multi-core, performance, concurrency]
keywords: [node.js worker threads vs cluster, node.js cluster mode, node.js worker threads, multi-core node.js, node.js cpu bound tasks, node.js concurrency, cluster vs worker threads node.js, node.js performance multi-core]
author: Oxmgr Team
---

Node.js runs on a single thread. That's not a bug — it's what makes the event loop fast for I/O-heavy workloads. But modern servers have 8, 16, or 64 cores, and leaving them idle is wasteful.

Node.js offers two ways to use multiple cores: **Cluster** and **Worker Threads**. They solve different problems and shouldn't be used interchangeably.

## The Short Answer

| Use case | Solution |
|----------|----------|
| Multiple HTTP servers, each handling requests independently | **Cluster** |
| CPU-intensive computation (image processing, crypto, parsing) | **Worker Threads** |
| Parallel I/O (many database queries at once) | **Neither** — async/await handles this |
| Mixed: web server + heavy computation | **Both** |

## Node.js Cluster

Cluster forks the Node.js process into multiple identical copies. Each copy runs your full application — its own event loop, memory space, and server. The OS (via the master process) distributes incoming connections across workers.

```javascript
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import express from 'express';

const numCPUs = availableParallelism(); // number of logical CPUs

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} forking ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} exited — forking replacement`);
    cluster.fork(); // keep the pool full
  });

} else {
  // Each worker runs this
  const app = express();

  app.get('/', (req, res) => {
    res.json({ pid: process.pid });
  });

  app.listen(3000, () => {
    console.log(`Worker ${process.pid} listening on :3000`);
  });
}
```

All workers share port 3000. The OS distributes requests. Simple.

**What cluster gives you:**
- Full multi-core CPU utilization for request handling
- Isolation: one worker crash doesn't affect others
- Zero-downtime restart: restart workers one at a time while others keep serving

**What cluster doesn't give you:**
- Shared memory between workers (each has its own heap)
- Parallelism for a single CPU-intensive operation
- Any advantage for I/O-bound workloads (async/await already handles those)

## Cluster with a Process Manager

Running cluster yourself means your app is responsible for forking and replacing crashed workers. A simpler approach: let Oxmgr handle the instances, and write a single-process app.

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
instances = 4   # Oxmgr forks 4 instances, each on a different port
restart_on_exit = true
```

With Nginx load-balancing across them:

```nginx
upstream api {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    listen 80;
    location / {
        proxy_pass http://api;
    }
}
```

Your app stays simple (no cluster code), and Oxmgr handles restarts, health checks, and rolling deploys across all 4 instances. This is the approach we recommend for most production setups. See the [multi-process deployment guide](/blog/run-multiple-nodejs-apps-one-server) for the full Nginx configuration.

## Node.js Worker Threads

Worker Threads are for CPU-bound work — operations that would block the event loop if run on the main thread.

**The problem with CPU-heavy code on the main thread:**

```javascript
// This blocks the event loop for ~500ms
// Every other request waits during this time
app.get('/process', (req, res) => {
  const result = expensiveComputation(req.body.data); // blocks!
  res.json({ result });
});
```

While `expensiveComputation` runs, Node.js can't process any other requests. From the outside, your server appears frozen.

**The fix — offload to a worker thread:**

```javascript
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// This runs in worker threads
if (!isMainThread) {
  const result = expensiveComputation(workerData.data);
  parentPort.postMessage(result);
  process.exit(0);
}

// In the main thread
function runInWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), {
      workerData: { data }
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

app.get('/process', async (req, res) => {
  const result = await runInWorker(req.body.data); // non-blocking!
  res.json({ result });
});
```

The main thread immediately gets back to handling requests while the worker runs on a separate OS thread.

## Worker Thread Pool

Spawning a new thread per request is expensive. For frequent CPU-bound operations, use a thread pool:

```javascript
import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';

class WorkerPool extends EventEmitter {
  #workers = [];
  #queue = [];
  #available = [];

  constructor(workerScript, size = 4) {
    super();
    for (let i = 0; i < size; i++) {
      this.#addWorker(workerScript);
    }
  }

  #addWorker(script) {
    const worker = new Worker(script);

    worker.on('message', ({ result, error, id }) => {
      const { resolve, reject } = this.#queue.find(q => q.id === id) ?? {};
      this.#queue = this.#queue.filter(q => q.id !== id);

      if (error) reject(new Error(error));
      else resolve(result);

      // Mark as available and process next
      this.#available.push(worker);
      this.#processNext();
    });

    this.#available.push(worker);
  }

  #processNext() {
    if (this.#queue.length === 0 || this.#available.length === 0) return;

    const { task, id } = this.#queue[0];
    const worker = this.#available.shift();

    worker.postMessage({ task, id });
  }

  run(task) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      this.#queue.push({ id, task, resolve, reject });
      this.#processNext();
    });
  }
}

// Create pool of 4 workers
const pool = new WorkerPool('./compute-worker.js', 4);

app.post('/compress', async (req, res) => {
  const result = await pool.run({ type: 'compress', data: req.body.data });
  res.json(result);
});
```

Or use a battle-tested library:

```bash
npm install piscina
```

```javascript
import Piscina from 'piscina';

const piscina = new Piscina({
  filename: new URL('./compute-worker.js', import.meta.url).href,
  maxThreads: 4
});

app.post('/process', async (req, res) => {
  const result = await piscina.run(req.body.data);
  res.json({ result });
});
```

`piscina` handles pool management, queuing, and worker lifecycle automatically.

## Real-World Example: Image Processing

A typical use case — resize images on upload:

```javascript
// image-worker.js
import sharp from 'sharp';

export default async function processImage({ buffer, width, height, format }) {
  const result = await sharp(Buffer.from(buffer))
    .resize(width, height, { fit: 'cover' })
    .toFormat(format)
    .toBuffer();

  return result;
}
```

```javascript
// server.js
import Piscina from 'piscina';
import multer from 'multer';

const pool = new Piscina({
  filename: new URL('./image-worker.js', import.meta.url).href,
  maxThreads: 4
});

const upload = multer({ storage: multer.memoryStorage() });

app.post('/upload', upload.single('image'), async (req, res) => {
  const resized = await pool.run({
    buffer: req.file.buffer,
    width: 800,
    height: 600,
    format: 'webp'
  });

  res.set('Content-Type', 'image/webp');
  res.send(resized);
});
```

The main thread handles HTTP. Worker threads handle Sharp (which is CPU-intensive). 4 images can be resized simultaneously without blocking any requests.

## When You Need Both

Heavy traffic + CPU-intensive work requires both cluster and worker threads:

```
[Load Balancer / Nginx]
        │
   ┌────┴────┐
[Worker 0] [Worker 1]  ← Cluster instances (one per CPU core for HTTP)
   │            │
[Thread Pool] [Thread Pool]  ← Worker threads within each cluster worker
```

```toml
# oxfile.toml — 4 cluster instances
[processes.api]
command = "node dist/server.js"
instances = 4
restart_on_exit = true
```

```javascript
// Each cluster instance runs its own thread pool
const pool = new Piscina({
  filename: new URL('./worker.js', import.meta.url).href,
  maxThreads: 2   // 4 instances × 2 threads = 8 total worker threads
});
```

Don't over-thread. `instances × maxThreads` should not exceed your CPU count by much, or you'll spend more time context-switching than computing.

## What Doesn't Need Either

Most Node.js performance problems aren't CPU-bound — they're I/O waits. Database queries, HTTP calls, file reads. These are already handled efficiently by the event loop.

```javascript
// This is fine — async I/O doesn't block the event loop
app.get('/data', async (req, res) => {
  const [users, orders] = await Promise.all([
    db.query('SELECT * FROM users WHERE active = true'),
    db.query('SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 7 DAY')
  ]);
  res.json({ users, orders });
});
```

Two parallel database queries with zero threads. Adding cluster or worker threads here wouldn't help.

The question to ask: **Is this work CPU-bound (blocks the thread) or I/O-bound (waits for external data)?** If I/O, async/await. If CPU, worker threads. If scaling I/O volume beyond one machine, cluster (or multiple Oxmgr instances).

## Summary

- **Cluster / Oxmgr instances** — scale request handling across CPU cores. Use for web servers, API servers, any app that needs horizontal scaling on a single machine.
- **Worker Threads** — offload CPU-heavy computation off the main thread. Use for image processing, video encoding, cryptography, heavy data parsing.
- **Neither** — most I/O-bound work. Trust the event loop.

For process-level management of clustered Node.js apps, see the [Oxmgr docs](/docs#oxfile-toml) — the `instances` field handles multi-process deployment without cluster code in your app.
