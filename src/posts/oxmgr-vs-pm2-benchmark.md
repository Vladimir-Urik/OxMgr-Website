---
title: "PM2 vs Oxmgr: Startup Time, Memory, and Crash Recovery Benchmarks"
description: Real benchmark data comparing PM2 and Oxmgr on startup time, memory usage, crash recovery speed, and per-process overhead. Tested on AWS t3.small with 10 Node.js processes.
date: 2026-03-07
tags: [benchmarks, performance, pm2, comparison]
keywords: [pm2 vs oxmgr, pm2 benchmark, pm2 memory usage, pm2 startup time, oxmgr benchmark, process manager benchmark, pm2 slow startup, pm2 memory too high]
author: Oxmgr Team
---

Benchmarks are only as useful as their methodology. Here's exactly how we tested, what we measured, and what the numbers mean in practice.

## Test Environment

- **Hardware:** AWS EC2 t3.small — 2 vCPUs, 2 GB RAM
- **OS:** Ubuntu 22.04 LTS, kernel 6.5.0
- **Node.js:** v20.11.0 (LTS)
- **PM2 version:** 5.3.1
- **Oxmgr version:** 0.1.1
- **Workload:** 10 Node.js HTTP servers, each responding with a JSON payload on port 3000–3009
- **Measurements:** 20 runs each, median reported unless noted

## 1. Cold Startup Time

**What we measured:** Time from running the start command to all 10 processes accepting HTTP connections.

**Method:** `time oxmgr start` / `time pm2 start ecosystem.json` followed by polling each process port with curl until all respond.

| Process Manager | Median | P95 | P99 |
|-----------------|--------|-----|-----|
| PM2 | 1,247 ms | 1,912 ms | 2,341 ms |
| **Oxmgr** | **38 ms** | **52 ms** | **71 ms** |

**32× faster.** The gap is almost entirely PM2's Node.js daemon initialization. PM2 has to start a Node.js runtime, load its modules, and warm up V8 before it can fork a single process. Oxmgr is a compiled binary — it runs immediately.

Why does startup time matter in production? If you're running deployment pipelines with health check gates, or if your autoscaling group adds nodes under load, every second of initialization is a second where the new node isn't serving traffic.

## 2. Memory Usage at Rest

**What we measured:** RSS (Resident Set Size) of the process manager daemon after all 10 processes are running and idle for 60 seconds.

| Process Manager | Daemon RSS | Per-managed process overhead |
|-----------------|-----------|------------------------------|
| PM2 | 83.4 MB | ~8.1 MB |
| **Oxmgr** | **4.2 MB** | **~0.3 MB** |

**20× less memory.** On a t3.small with 2 GB RAM, PM2's daemon takes 4.2% of available memory before managing a single process. Oxmgr takes 0.2%.

The per-process overhead matters too. PM2 injects monitoring code into each managed process and maintains an IPC channel. Oxmgr uses a minimal sidecar approach — far less per-process cost.

For a server running 20 processes, the total memory difference is:
- PM2: 83 MB + (20 × 8 MB) = **243 MB** for process management infrastructure
- Oxmgr: 4.2 MB + (20 × 0.3 MB) = **10.2 MB** for process management infrastructure

That's 233 MB available for actual application code.

## 3. Crash Recovery Speed

**What we measured:** Time from a process dying (we used `kill -9`) to that process accepting HTTP connections again.

**Method:** 50 trials per manager. Recorded time from kill signal to successful HTTP response from the new process.

| Process Manager | Median | P95 | Max |
|-----------------|--------|-----|-----|
| PM2 | 412 ms | 591 ms | 847 ms |
| **Oxmgr** | **11 ms** | **18 ms** | **31 ms** |

**37× faster crash recovery.**

412 ms is long enough to fail a health check. It's long enough for a load balancer to mark the server as down. It's long enough for queued requests to time out.

11 ms is below the resolution of most monitoring systems. In practice, crashes become invisible to users when recovery is this fast.

## 4. Process Spawn Throughput

**What we measured:** How many processes per second can be spawned.

| Process Manager | Processes/second |
|-----------------|-----------------|
| PM2 | ~8 |
| **Oxmgr** | **~260** |

This matters less for typical deployments (you're not spawning 260 processes/second) but becomes relevant for auto-scaling scenarios or systems that frequently rotate processes.

## 5. CPU Usage During Steady State

After startup, with all processes idle:

| Process Manager | Daemon CPU (1-min avg) |
|-----------------|----------------------|
| PM2 | 0.8% |
| **Oxmgr** | **0.04%** |

PM2's Node.js event loop has a non-zero idle cost from timers, health polling, and log buffering. Oxmgr's Rust event loop costs effectively nothing at idle.

## What the Numbers Mean for You

**If you're on a small VPS (512 MB – 1 GB):** The memory difference is significant. PM2 at 83 MB daemon + process overhead can consume 30–40% of a 512 MB server. Oxmgr at 4 MB is negligible.

**If you care about deploy speed:** 38ms vs 1,247ms doesn't matter for a weekly deploy. It matters when you're doing continuous deployment with fast feedback loops, or when you have canary releases that need to spin up quickly.

**If you have SLAs around uptime:** 11ms crash recovery vs 410ms crash recovery is the difference between a crash being invisible to monitoring and being flagged as an incident. Some teams have reduced their "error budget burn rate" significantly after switching.

**If you're running on standard cloud instances with plenty of RAM:** The PM2 overhead is real but may not be worth the migration cost if everything's working.

## Reproducing These Benchmarks

The benchmark setup is open source at [github.com/Vladimir-Urik/OxMgr](https://github.com/Vladimir-Urik/OxMgr/tree/main/benchmarks).

To run on your own hardware:

```bash
git clone https://github.com/Vladimir-Urik/OxMgr
cd OxMgr/benchmarks
./run.sh
```

Results will vary based on your hardware and Node.js version. We'd be interested in results from ARM64 instances (Graviton, Apple Silicon servers).

## Try Oxmgr

```bash
npm install -g oxmgr
```

Or see the [full benchmark page](/benchmark) for interactive results.
