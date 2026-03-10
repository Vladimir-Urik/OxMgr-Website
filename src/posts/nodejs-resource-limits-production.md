---
title: Node.js Resource Limits in Production — Memory, CPU, and Restart Policies
description: How to set memory and CPU limits for Node.js processes in production. Covers Node.js heap limits, process manager resource caps, cgroups, and restart policies that prevent one process from taking down the whole server.
date: 2026-05-06
tags: [node.js, production, memory, cpu, resource-limits, devops, performance]
keywords: [node.js memory limit production, node.js cpu limit, node.js max memory, node.js heap limit, process resource limits linux, node.js memory management production, node.js out of memory, node.js resource management]
author: Oxmgr Team
---

One Node.js process with a memory leak can take down your entire server — consuming all RAM until the OOM killer starts killing everything, including your database.

Resource limits are the safety net that prevents this. Set them up before you need them.

## The Two Levels of Limits

**Level 1 — V8 heap limit** (`--max-old-space-size`): Controls how much heap memory the JavaScript runtime can allocate. When exceeded, Node.js throws `FATAL ERROR: Reached heap limit Allocation failed` and crashes.

**Level 2 — OS-level limits**: Controls how much memory the entire Node.js process (heap + native modules + buffers) can use. Enforced by the kernel via cgroups. When exceeded, the kernel kills the process with `SIGKILL`.

You need both. The V8 limit gives you a controlled crash with a stack trace. The OS limit is the last resort backstop.

## V8 Heap Limit

Node.js defaults to ~1.5 GB on 64-bit systems. For most apps this is fine, but you should set it explicitly based on your server's RAM:

```bash
# Set heap limit to 512 MB
node --max-old-space-size=512 server.js
```

In `oxfile.toml`:

```toml
[processes.api]
command = "node --max-old-space-size=512 dist/server.js"
restart_on_exit = true
```

**Rule of thumb:** Set `--max-old-space-size` to 75% of the RAM you want the process to use. This leaves headroom for native buffers and avoids the OOM killer.

For a 1 GB allocation: `--max-old-space-size=768`
For a 512 MB allocation: `--max-old-space-size=384`

### Why Not Just Set It High?

Setting it too high means:
- A memory leak grows unchecked until it actually causes a system-wide problem
- No crash + stack trace to help you diagnose the leak
- Other processes on the server get starved

Set it low enough to catch leaks early, but high enough that normal usage never hits it.

## Process Manager Resource Limits (Oxmgr)

Oxmgr monitors memory and CPU usage and restarts processes that exceed limits:

```toml
[processes.api.limits]
memory_mb = 512      # restart if RSS exceeds 512 MB
cpu_percent = 90     # restart if CPU >90%...
cpu_window_secs = 60 # ...sustained for 60 seconds
```

This is different from the V8 heap limit — it measures **RSS** (Resident Set Size), which includes heap, code, native modules, and buffers. RSS is always higher than heap.

**Setting the right memory limit:**

1. Run your app under normal load
2. Check RSS: `oxmgr status` or `ps -o rss= -p <PID>`
3. Set the limit to 2–3× normal usage

If normal RSS is 120 MB, set `memory_mb = 256`. This catches leaks (memory growing from 120 to 256+) while ignoring normal variance.

### Per-Process Limits for Multi-Service Apps

Different processes need different limits:

```toml
[processes.api]
command = "node dist/server.js"

[processes.api.limits]
memory_mb = 1024    # API can use up to 1GB


[processes.worker]
command = "node dist/worker.js"

[processes.worker.limits]
memory_mb = 512     # worker is less demanding


[processes.thumbnail-generator]
command = "node dist/thumbnails.js"

[processes.thumbnail-generator.limits]
memory_mb = 2048    # image processing is memory-hungry
cpu_percent = 80    # cap CPU to avoid starving other processes
cpu_window_secs = 30
```

## Linux cgroups (System-Level Limits)

For the strongest protection, use cgroups to hard-limit what a process can allocate. Even if the process manager fails, the kernel enforces the limit.

Via systemd (recommended):

```ini
# /etc/systemd/system/oxmgr.service
[Service]
# ...
MemoryMax=4G        # hard limit — OOM kill if exceeded
MemoryHigh=3G       # soft limit — throttled/swapped above this
CPUQuota=400%       # max 4 CPU cores equivalent
```

Or directly with cgroup v2:

```bash
# Create a cgroup for your app
sudo cgcreate -g memory,cpu:myapp

# Set limits
echo 536870912 | sudo tee /sys/fs/cgroup/memory/myapp/memory.limit_in_bytes  # 512 MB
echo 50000 | sudo tee /sys/fs/cgroup/cpu/myapp/cpu.cfs_quota_us  # 50% of one core

# Run process in the cgroup
sudo cgexec -g memory,cpu:myapp node server.js
```

For most setups, the systemd approach is simpler and more maintainable.

## Restart Policies

Resource limit enforcement means processes will occasionally restart. Configure restart behavior carefully:

```toml
[processes.api]
command = "node dist/server.js"
restart_on_exit = true
restart_delay_ms = 2000    # wait 2s before restarting
max_restarts = 10          # stop after 10 restarts

[processes.api.limits]
memory_mb = 512
```

**`max_restarts`** is important when using resource limits. Without it, a memory leak causes an infinite restart loop:
1. Process starts, uses 120 MB
2. Leak grows to 512 MB
3. Oxmgr restarts it
4. Repeat indefinitely

With `max_restarts = 10`, after 10 restarts the process is left stopped. You get paged, you investigate. The leak is fixed, not hidden.

### Exponential Backoff for Crash Loops

For flaky processes that crash due to external dependencies (database not available, API down), use progressive delays:

```toml
[processes.api]
restart_on_exit = true
restart_delay_ms = 1000   # start with 1 second
# Oxmgr doubles the delay up to a max on each consecutive crash
restart_delay_max_ms = 60000  # cap at 60 seconds
```

This prevents hammering a database that's recovering from an outage.

## Memory Leak Detection

A restart policy is a cure. Detection is prevention.

**Log memory trends:**

```javascript
// In your app — log memory every 5 minutes
setInterval(() => {
  const mem = process.memoryUsage();
  console.log(JSON.stringify({
    level: 'info',
    type: 'memory',
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    ts: Date.now()
  }));
}, 5 * 60 * 1000);
```

Extract the trend from logs:

```bash
grep '"type":"memory"' /var/log/api/app.log \
  | jq -r '[.ts, .rssMB] | @csv' \
  | sort
```

If RSS grows steadily (not correlated with traffic), you have a leak.

**Heap snapshots on demand:**

```javascript
import { writeHeapSnapshot } from 'node:v8';

// Protected diagnostic endpoint
app.get('/debug/heap-snapshot', authenticate, (req, res) => {
  const path = writeHeapSnapshot('/tmp');
  res.json({ path, size: fs.statSync(path).size });
});
```

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://your-app.com/debug/heap-snapshot
# Returns: {"path":"/tmp/Heap.20260506.123456.heapsnapshot","size":85432100}
scp user@your-server:/tmp/Heap.*.heapsnapshot .
# Open in Chrome DevTools → Memory → Load
```

For a full guide on identifying memory leaks, see [Node.js Memory Leaks in Production](/blog/nodejs-memory-leaks-production).

## CPU Throttling

High CPU is often a sign of an infinite loop, a regex catastrophe, or unexpected heavy computation. Rather than letting it freeze the server:

**Detect event loop blocking:**

```javascript
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setInterval(() => {
  const lag = histogram.mean / 1e6;  // nanoseconds → milliseconds

  if (lag > 50) {
    console.warn(JSON.stringify({
      level: 'warn',
      type: 'event-loop-lag',
      lagMs: lag.toFixed(1),
      ts: Date.now()
    }));
  }

  histogram.reset();
}, 30_000);
```

**Offload CPU work to worker threads** to keep the event loop responsive. See the [Node.js Worker Threads guide](/blog/nodejs-worker-threads-vs-cluster).

**Cap CPU with Oxmgr:**

```toml
[processes.heavy-computation]
command = "node processor.js"

[processes.heavy-computation.limits]
cpu_percent = 200     # max 2 CPU cores
cpu_window_secs = 30
```

## The Complete Safety Net

Layer these together:

```toml
[processes.api]
command = "node --max-old-space-size=768 dist/server.js"
restart_on_exit = true
restart_delay_ms = 2000
max_restarts = 10

[processes.api.limits]
memory_mb = 1024    # RSS limit (> heap limit by design)
cpu_percent = 180   # max ~2 cores
cpu_window_secs = 60
```

Layer 1: `--max-old-space-size=768` — V8 crashes cleanly with a stack trace when heap hits 768 MB
Layer 2: `memory_mb = 1024` — Oxmgr restarts if RSS (not just heap) exceeds 1 GB
Layer 3: systemd `MemoryMax` — kernel kills if the process exceeds the cgroup limit

Three safety nets. A memory leak now gives you:
1. A clean crash at 768 MB with a stack trace to investigate
2. An automatic restart (up to 10 times)
3. If restarts fail, the process stays stopped — not taking down the server

Investigate the stack trace, fix the leak, deploy. No 3am server outages.
