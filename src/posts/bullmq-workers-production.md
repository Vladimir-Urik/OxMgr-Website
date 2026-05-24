---
title: Running BullMQ Workers in Production — Concurrency, Restarts, and Avoiding Stuck Jobs
description: BullMQ makes Redis-backed job queues easy. Running the workers in production safely is the part the README skips. Here's the supervision, concurrency, and recovery story.
date: 2026-06-22
tags: [bullmq, redis, queue, worker, production, node.js, process-manager]
keywords: [bullmq production, bullmq worker process, bullmq pm2, bullmq concurrency, bullmq stuck jobs, bullmq graceful shutdown, redis queue node.js, background jobs node.js]
author: Oxmgr Team
---

# Running BullMQ Workers in Production

BullMQ is the de facto Redis queue for Node. Writing producers is easy. Writing consumers is easy. Running consumers in production — keeping them alive, sized right, and not leaving half-processed jobs behind during deploys — is the part where teams accumulate scar tissue.

This post is the supervision and lifecycle layer around BullMQ workers, not a BullMQ tutorial.

## The Two-Process Reality

A typical BullMQ setup has at least two processes:

- **API** — your web server, which adds jobs to queues.
- **Worker** — a separate process that consumes jobs.

Don't run workers in the API process. Workers have unpredictable runtimes, occasional CPU spikes, and you don't want a slow image-resize job to make HTTP requests time out. Separate processes mean separate memory footprints, separate restart policies, and separate observability.

A minimal worker process:

```ts
// worker.ts
import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'emails',
  async (job) => {
    await sendEmail(job.data);
  },
  {
    connection,
    concurrency: 10,
  }
);

worker.on('failed', (job, err) => {
  console.error(`job ${job?.id} failed`, err);
});
```

`maxRetriesPerRequest: null` is required by BullMQ on the Redis connection — without it, you'll get cryptic timeouts under load.

## Supervision

Each worker process needs a supervisor. With [Oxmgr](https://oxmgr.empellio.com) you describe API and worker together:

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
cwd = "/srv/myapp"
env_file = ".env"
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "20s"

[processes.worker]
command = "node dist/worker.js"
cwd = "/srv/myapp"
env_file = ".env"
restart = "always"
stop_signal = "SIGTERM"
stop_timeout = "60s"

[processes.worker.limits]
memory = "512M"
```

Two things to notice:

1. **`stop_timeout = "60s"` on the worker.** Workers might be in the middle of a long job. They need time to finish before being killed. If your jobs can take 5 minutes, set this to 5 minutes plus a buffer.
2. **`restart = "always"` on the worker.** Workers should always come back. A worker that exits cleanly when there are no jobs is wrong — it should sleep and wait.

For the supervisor primer, see [what is a process manager](/blog/what-is-a-process-manager).

## Graceful Shutdown — The Job-Loss Problem

This is the bug that bites everyone exactly once. The story:

1. You deploy.
2. Supervisor sends `SIGTERM` to the worker.
3. The worker has 5 jobs currently processing.
4. The worker exits immediately.
5. Those 5 jobs are now stuck in Redis with `active` state.
6. BullMQ's stalled-check eventually moves them back to `waiting` — but only after `lockDuration` expires (default 30s).
7. Until then, those jobs are invisible. After, they retry from scratch.

The fix is to handle `SIGTERM` explicitly and let active jobs finish:

```ts
const shutdown = async () => {
  console.log('worker draining...');
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

`worker.close()` stops fetching new jobs and waits for active ones to finish. Combined with a supervisor `stop_timeout` longer than your longest job, you get zero job loss on deploys.

The general shutdown pattern is in the [graceful shutdown guide](/blog/nodejs-graceful-shutdown-complete-guide). The BullMQ-specific addition is `worker.close()`.

## Concurrency vs Process Count

You have two knobs:

- **Concurrency per worker** (the `concurrency` option) — how many jobs a single Node process handles in parallel.
- **Worker process count** — how many separate Node processes you run.

The trade-offs:

- **High concurrency, one process**: lowest memory overhead. But one slow job blocks the others on the event loop if the job code is CPU-heavy.
- **Low concurrency, many processes**: higher memory floor, but better isolation. If one process OOMs, the others keep working.

For I/O-bound jobs (sending emails, calling APIs): `concurrency: 20`, one process.

For CPU-bound jobs (image processing, PDF generation): `concurrency: 1`, multiple processes.

For mixed workloads: separate queues with separate worker processes. Don't put `send-email` and `transcode-video` in the same worker.

## Memory Limits

Workers leak. They process jobs with varying payload sizes, instantiate heavy libraries (image processing, PDF tools), and accumulate state if you're not careful. A memory cap turns a leak into a clean restart:

```toml
[processes.worker.limits]
memory = "512M"
```

When the worker hits the cap, the supervisor SIGKILLs it. BullMQ's stalled-job recovery picks up where it left off. The next worker process starts fresh.

This is one of the reasons to have multiple worker processes: a single OOM doesn't pause your whole queue. The [resource limits post](/blog/nodejs-resource-limits-production) covers the supervisor side; the [memory leaks post](/blog/nodejs-memory-leaks-production) covers diagnosis.

## Health Checks for Workers

Workers don't have HTTP endpoints by default. Two options:

**Option A:** Expose a tiny health server from the worker process:

```ts
import http from 'node:http';

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(worker.isPaused() ? 503 : 200);
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(9100);
```

Your supervisor pings `http://127.0.0.1:9100/health`. Use a different port for each worker process.

**Option B:** Use a heartbeat file the worker touches periodically; supervisor checks staleness.

Option A is cleaner. The [health checks guide](/blog/nodejs-health-checks) covers the HTTP pattern.

## Stuck Jobs and Stalled Checks

Even with clean shutdown, jobs can stall: the worker process gets `SIGKILL`'d, the box loses power, the network partitions. BullMQ handles this via lock heartbeats — every `lockDuration / 2` ms, the worker renews its lock on the active job. If the lock expires, the job is considered stalled and moved back to `waiting`.

Production tuning:

```ts
new Worker('emails', handler, {
  connection,
  concurrency: 10,
  lockDuration: 30_000, // 30s
  maxStalledCount: 1,   // retry stalled jobs once before failing
});
```

If your jobs take longer than 30 seconds, increase `lockDuration`. If your supervisor's `stop_timeout` is less than `lockDuration`, you'll see stalled jobs on every deploy.

Order of magnitudes that should match:

```
supervisor stop_timeout > job runtime > lockDuration / 2
```

## Observability

Run [Bull Board](https://github.com/felixmosh/bull-board) on a separate route (admin-protected) for a UI to inspect queues. For production metrics, expose Prometheus counters from the worker process and scrape them from your monitoring stack.

The metrics worth tracking:

- Jobs processed per second per queue.
- Job duration p50, p95, p99.
- Failed job count.
- Waiting queue depth (alerts when this grows unboundedly).

## A Common Mistake: Single Redis for Queue and Cache

If your queue Redis is the same instance as your cache Redis, a memory spike from cache eviction can break the queue. Run separate Redis instances (or separate logical databases at minimum). For production, separate instances are safer.

## Deploys

Standard process:

1. Stop workers, wait for drain.
2. Deploy new code.
3. Start workers.

The supervisor does the first and third steps; you do the second. With Oxmgr:

```bash
# After rsyncing new code:
oxm reload worker
```

This sends `SIGTERM`, waits for `stop_timeout`, then starts the new version. As long as `stop_timeout > max job duration`, no jobs are lost.

For automated deploys, see the [git webhook deploy guide](/blog/git-webhook-auto-deploy-nodejs).

## Common Pitfalls

- **No `worker.close()` on SIGTERM.** Job loss on every deploy.
- **`stop_timeout` shorter than job runtime.** Same outcome.
- **Workers in the API process.** Slow jobs block HTTP requests.
- **Same Redis for queue and cache.** Cache evictions can corrupt queue state.
- **`maxRetriesPerRequest: null` missing.** Cryptic timeouts under load.
- **Running multiple workers without `concurrency` tuning.** You can saturate Redis with thousands of concurrent in-flight jobs.

## Bottom Line

BullMQ in production is a story about boundaries: separate process from API, separate queue Redis from cache Redis, separate worker processes by job type. A supervisor that sends `SIGTERM` and waits long enough turns deploys into a non-event.

[Oxmgr](https://oxmgr.empellio.com) handles API + workers + health endpoints from one config file, with per-process memory caps and stop-timeout tuning that match what BullMQ actually needs.
