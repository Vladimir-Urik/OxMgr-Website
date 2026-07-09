---
title: Running Celery Workers in Production — Concurrency, Restarts, and Stuck Tasks
description: A production guide to Celery workers — choosing prefork vs gevent concurrency, the beat scheduler, memory recycling, graceful restarts, and supervising it all so tasks never silently stop running.
date: 2026-08-22
tags: [celery, python, redis, queue, production, process-manager, devops]
keywords: [celery workers production, celery concurrency prefork gevent, celery beat scheduler, celery memory leak max-tasks-per-child, celery supervisor, celery graceful restart, celery stuck tasks]
author: Oxmgr Team
---

# Running Celery Workers in Production

Celery is the default background-job system for Python, and the failure mode is always the same: the worker quietly stops, or gets stuck, or leaks memory until it's killed — and nobody notices because it doesn't serve HTTP, so there's no error page. The fix is correct concurrency settings plus a real supervisor. Here's the production setup.

## The pieces

A Celery deployment has three moving parts you supervise:

- **Worker(s)** — `celery -A app worker`, the processes that run tasks.
- **Beat** — `celery -A app beat`, the scheduler that enqueues periodic tasks. **Exactly one** must run, ever.
- **A broker** — Redis or RabbitMQ (usually [Redis](/blog/bullmq-workers-production), which handles this role the same way for Node's BullMQ).

## Choosing a concurrency model

This is the decision that determines everything else:

| Pool | Best for | How it scales |
|---|---|---|
| **prefork** (default) | CPU-bound tasks | Separate processes; `--concurrency` ≈ CPU cores |
| **gevent / eventlet** | IO-bound tasks (HTTP calls, DB) | Green threads; `--concurrency` in the hundreds |
| **solo** | Debugging only | One task at a time |

If your tasks mostly *wait* — calling APIs, querying databases, sending email — you want `gevent` with high concurrency, and you'll get far more throughput per core. If they *compute* — image processing, ML inference — you want `prefork` sized to your cores. Picking prefork for IO-bound work is the most common Celery scaling mistake. (It's the same [worker-threads-vs-cluster](/blog/nodejs-worker-threads-vs-cluster) trade-off in Python clothing.)

```bash
# IO-bound
celery -A app worker --pool=gevent --concurrency=200

# CPU-bound
celery -A app worker --pool=prefork --concurrency=4
```

## The memory-leak defense: max-tasks-per-child

Celery workers leak. It's usually not your code — it's C extensions and long-lived interpreters accumulating memory. The built-in defense recycles a worker process after N tasks:

```bash
celery -A app worker --max-tasks-per-child=100 --max-memory-per-child=300000
```

`--max-tasks-per-child` restarts the child after 100 tasks; `--max-memory-per-child` (in KB) restarts it if it crosses a memory ceiling. Together they bound growth so a leak never becomes an [OOM kill](/blog/linux-oom-killer-nodejs). Set these — they're the single most important production flags.

## Supervise it properly

A Celery worker that dies stops processing jobs *silently*. This is why supervision matters more here than for a web server — nobody gets a 500, the queue just grows. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.worker]
command = "celery -A app worker --pool=gevent --concurrency=200 --max-tasks-per-child=100"
working_dir = "/srv/myapp"
instances = 2
restart_on_exit = true
stop_signal = "SIGTERM"
stop_timeout_ms = 30000

[processes.worker.env]
CELERY_BROKER_URL = "redis://localhost:6379/0"

[processes.beat]
command = "celery -A app beat --loglevel=info"
working_dir = "/srv/myapp"
restart_on_exit = true
```

Two critical details:

1. **`SIGTERM` + a generous `stop_timeout_ms`.** Celery does a *warm shutdown* on `SIGTERM` — it stops taking new tasks and finishes running ones. Give it time (30s here) before it's force-killed, or you'll drop in-flight jobs. This is [graceful shutdown](/blog/nodejs-graceful-shutdown-complete-guide), Celery-style.
2. **Beat is a singleton.** Run `beat` as exactly one instance. Two beats = every scheduled task fires twice. Never set `instances > 1` on the beat process, and never run it on two servers.

## Watch for stuck tasks

Sometimes a worker is "alive" but wedged — a task hung on a network call with no timeout. Defenses:

- **Always set task time limits:** `--time-limit=300 --soft-time-limit=270`. Soft raises an exception your task can catch; hard kills the worker child. Without these, one stuck task pins a slot forever.
- **Monitor queue depth.** If the Redis list keeps growing, workers aren't keeping up or are stuck. A quick check pairs well with [JSON scripting](/blog/process-manager-json-jq-scripting) for the worker side and a Redis `LLEN` for the queue side.
- **Alert on worker crashes** — subscribe to the [event bus](/blog/process-manager-event-bus) so a `process:crashed` on `worker` pings [Slack](/blog/crash-alerts-slack-discord) with the traceback.

## Deploys must restart workers

Like every queue worker, Celery runs *old code until restarted*. Your [deploy](/blog/how-to-deploy-nodejs-production) must end with `oxmgr reload worker beat`. Because of the warm shutdown, this drains cleanly: new workers pick up new tasks while old ones finish theirs.

## The Python web tier, separately

Celery is only your *background* tier. Your FastAPI/Django/Flask web tier is a different set of processes with its own supervision — covered in the [Python process manager guide](/blog/python-process-manager-production) and [FastAPI in production](/blog/fastapi-production-process-manager). Run both under the same process manager and your whole Python stack — web, workers, beat — lives in one `oxfile.toml` with one dashboard.

## The short version

Match the pool to your workload (gevent for IO, prefork for CPU), set `--max-tasks-per-child` and task time limits, run exactly one beat, and supervise everything with `SIGTERM` + a real drain timeout. Do that and Celery stops being the thing that silently stopped running last week.
