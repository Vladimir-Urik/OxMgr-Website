---
title: Node.js Graceful Shutdown — The Complete Guide
description: How to implement graceful shutdown in Node.js correctly. Covers SIGTERM handling, finishing in-flight requests, closing database connections, draining queues, and testing that shutdown actually works.
date: 2026-05-09
tags: [node.js, graceful-shutdown, sigterm, production, deployment]
keywords: [node.js graceful shutdown, node.js sigterm handler, graceful shutdown node.js express, node.js shutdown handler, finish in-flight requests node.js, node.js process shutdown, node.js close server gracefully, node.js sigterm sigint]
author: Oxmgr Team
---

Graceful shutdown is what separates a production-ready Node.js app from one that drops requests when you deploy or restart.

Without it, every rolling restart — every deploy — cuts off in-flight requests. Users see errors. Your error rate spikes. Monitoring alerts fire. With graceful shutdown, restarts are invisible.

## What Graceful Shutdown Means

When your process manager (Oxmgr, PM2, or systemd) wants to stop your app, it sends `SIGTERM`. Graceful shutdown means:

1. **Stop accepting new connections** — don't start work you won't finish
2. **Finish existing requests** — complete any in-flight HTTP requests
3. **Close database connections** — return connections to the pool cleanly
4. **Flush logs and queues** — don't lose pending messages
5. **Exit cleanly** — `process.exit(0)`

If you don't handle `SIGTERM`, Node.js exits immediately. In-flight requests get cut off with TCP connection resets. The client receives a network error.

## The Minimal Implementation

```javascript
import express from 'express';
import { createServer } from 'node:http';

const app = express();
const server = createServer(app);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/slow', (req, res) => {
  // Simulate a 2-second operation
  setTimeout(() => res.json({ data: 'done' }), 2000);
});

server.listen(3000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');

  server.close((err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
    console.log('Server closed. Process exiting.');
    process.exit(0);
  });
});
```

`server.close()` stops accepting new connections. Existing connections stay open until their current requests complete, then close naturally.

**Test it:**

```bash
node server.js &
PID=$!

# Start a slow request
curl http://localhost:3000/slow &

# Immediately send SIGTERM
kill -SIGTERM $PID

# The slow request should still complete with {"data":"done"}
# Server should then exit cleanly
```

If the slow request completes — your graceful shutdown works.

## The Problem: Keep-Alive Connections

HTTP keep-alive reuses TCP connections for multiple requests. `server.close()` stops accepting new connections but doesn't close idle keep-alive connections. The server hangs waiting for those connections to close on their own (which can take minutes).

**Track and destroy connections explicitly:**

```javascript
const connections = new Map(); // connectionId → socket
let connectionId = 0;
let isShuttingDown = false;

server.on('connection', (socket) => {
  const id = connectionId++;
  connections.set(id, socket);

  socket.on('close', () => {
    connections.delete(id);
  });
});

// Mark connections as shutting down when they finish the current request
server.on('request', (req, res) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
  }
});

function gracefulShutdown(signal) {
  console.log(`${signal} received at ${new Date().toISOString()}`);
  isShuttingDown = true;

  server.close((err) => {
    if (err) {
      console.error('Server close error:', err);
      process.exit(1);
    }
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Destroy idle connections immediately
  // Active connections will close after their current request completes
  for (const [id, socket] of connections) {
    if (socket.destroyed) {
      connections.delete(id);
      continue;
    }
    // Check if there's an active request on this socket
    const isIdle = !socket._httpMessage || socket._httpMessage.finished;
    if (isIdle) {
      socket.destroy();
      connections.delete(id);
    }
  }

  // Force exit if shutdown takes too long
  setTimeout(() => {
    console.error('Graceful shutdown timed out after 30s. Forcing exit.');
    process.exit(1);
  }, 30_000).unref(); // .unref() so this doesn't prevent normal exit
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C in development
```

## With Express and a Real Database

A production pattern with Express, PostgreSQL (via `pg`), and Oxmgr:

```javascript
import express from 'express';
import { createServer } from 'node:http';
import pg from 'pg';

const app = express();
const server = createServer(app);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Track connections
const connections = new Map();
let isShuttingDown = false;
let connectionId = 0;

server.on('connection', (socket) => {
  const id = connectionId++;
  connections.set(id, socket);
  socket.on('close', () => connections.delete(id));
});

server.on('request', (req, res) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
  }
});

// Routes
app.get('/health', async (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  res.json({ status: 'ok' });
});

app.get('/users', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM users LIMIT 100');
  res.json(rows);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`${signal}: beginning graceful shutdown`);
  isShuttingDown = true;

  // 1. Stop accepting new HTTP connections
  server.close();

  // 2. Destroy idle connections
  for (const [id, socket] of connections) {
    if (!socket._httpMessage || socket._httpMessage.finished) {
      socket.destroy();
      connections.delete(id);
    }
  }

  // 3. Wait for in-flight requests to finish (max 30s)
  const shutdownTimeout = setTimeout(() => {
    console.error('Shutdown timeout — forcing exit');
    process.exit(1);
  }, 30_000);
  shutdownTimeout.unref();

  // 4. Close database pool (waits for active queries to complete)
  try {
    await pool.end();
    console.log('Database pool closed.');
  } catch (err) {
    console.error('Error closing database pool:', err);
  }

  // 5. Wait for server to fully close
  await new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.on('close', resolve);
  });

  clearTimeout(shutdownTimeout);
  console.log('Graceful shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors — log them, then exit gracefully
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // In production, treat unhandled rejections as fatal
  shutdown('unhandledRejection').catch(() => process.exit(1));
});

server.listen(3000, () => {
  console.log(`Server listening on :3000 (pid ${process.pid})`);
});
```

## Shutting Down Gracefully with Queues

If your app processes jobs from a queue (Bull, BullMQ, RabbitMQ), you need to stop accepting new jobs and let current jobs finish:

```javascript
import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL);

const worker = new Worker('jobs', async (job) => {
  console.log(`Processing job ${job.id}: ${job.name}`);
  await processJob(job.data);
}, {
  connection: redis,
  concurrency: 5
});

// Shutdown
async function shutdown(signal) {
  console.log(`${signal}: shutting down worker`);

  // Stop picking up new jobs, wait for current jobs to finish
  await worker.close();
  console.log('Worker closed — all jobs complete.');

  await redis.quit();
  console.log('Redis connection closed.');

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
```

BullMQ's `worker.close()` waits for all in-progress jobs to complete. Current jobs are not interrupted. New jobs remain in the queue for another worker to pick up.

## Oxmgr Configuration for Graceful Shutdown

Configure Oxmgr to give your app enough time to shut down:

```toml
[processes.api]
command = "node dist/server.js"
restart_on_exit = true
stop_signal = "SIGTERM"        # signal sent on stop/reload
stop_timeout_ms = 30000        # wait up to 30s for graceful shutdown

[processes.worker]
command = "node dist/worker.js"
restart_on_exit = true
stop_signal = "SIGTERM"
stop_timeout_ms = 60000        # workers may take longer to finish jobs
```

During `oxmgr reload api` (rolling restart):
1. Oxmgr starts the new instance
2. New instance passes health checks
3. Oxmgr sends `SIGTERM` to the old instance
4. Old instance finishes in-flight requests
5. Old instance exits cleanly
6. Users saw nothing

The `stop_timeout_ms` is how long Oxmgr waits before sending `SIGKILL` (force kill). If your graceful shutdown is working correctly, the process exits well before the timeout.

## Health Check During Shutdown

Your health endpoint should return 503 once shutdown begins. This tells the load balancer to stop sending traffic to this instance:

```javascript
app.get('/health', (req, res) => {
  if (isShuttingDown) {
    // Tell load balancer: stop sending traffic here
    return res.status(503).json({ status: 'shutting_down' });
  }
  res.json({ status: 'ok' });
});
```

Oxmgr and Nginx check this during rolling restarts. When the health check returns 503, Nginx routes traffic to the other instances.

## Testing Graceful Shutdown

Don't assume it works — test it:

```bash
#!/bin/bash
# test-graceful-shutdown.sh

APP_PID=""
REQUESTS_COMPLETE=0
REQUESTS_FAILED=0

# Start server
node server.js &
APP_PID=$!
sleep 1

echo "Server started (PID: $APP_PID)"

# Send 10 slow requests in background
for i in $(seq 1 10); do
  (
    if curl -sf --max-time 60 http://localhost:3000/slow > /dev/null; then
      echo "Request $i: OK"
    else
      echo "Request $i: FAILED"
    fi
  ) &
done

# Wait for requests to be in-flight
sleep 0.5

# Send SIGTERM
echo "Sending SIGTERM..."
kill -SIGTERM $APP_PID

# Wait for server to exit
wait $APP_PID
EXIT_CODE=$?

echo "Server exited with code $EXIT_CODE"
echo "Done"
```

A passing test shows all requests completed despite the SIGTERM.

## Common Mistakes

**Missing `unref()` on the force-exit timeout:**

```javascript
// Without .unref(), this timer prevents Node.js from exiting naturally
const timer = setTimeout(() => process.exit(1), 30_000);

// With .unref(), the timer only fires if the process is still running
const timer = setTimeout(() => process.exit(1), 30_000);
timer.unref(); // ← required
```

**Not closing the database pool:**

Database connections held by a shutting-down process block the connection pool for other services. Always call `pool.end()` during shutdown.

**Too short a timeout in the process manager:**

If your app takes 10 seconds to drain but Oxmgr's `stop_timeout_ms` is 5 seconds, requests get cut off. Set the timeout longer than your worst-case shutdown time.

**Not handling `uncaughtException`:**

Uncaught exceptions skip your SIGTERM handler entirely. Handle them explicitly and trigger graceful shutdown.

For zero-downtime rolling restarts that rely on graceful shutdown working correctly, see the [zero-downtime deployment guide](/blog/zero-downtime-deployment). For health check configuration, see the [Oxfile.toml reference](/blog/oxfile-toml-complete-guide#health-checks).
