---
title: PM2 Using Too Much Memory? Why It Happens and What to Do
description: Why PM2 uses so much RAM — the Node daemon, God process, and pm2-logrotate — plus how to measure it, trim it, and when to switch to a lighter process manager.
date: 2026-07-29
tags: [pm2, memory, node.js, process-manager, performance, devops]
keywords: [pm2 high memory usage, pm2 memory leak, pm2 god daemon memory, pm2 too much ram, reduce pm2 memory, pm2 max_memory_restart, pm2 lightweight alternative]
author: Oxmgr Team
---

# PM2 Using Too Much Memory?

You check `htop` on a 1 GB VPS and there's a `PM2 v5: God Daemon` sitting at 80–120 MB — and that's before your actual app. On a small box that's a real chunk of your memory doing nothing but supervision. Here's why it happens, how to measure it honestly, and what your options are.

## Where the memory goes

PM2 is a Node.js program that manages Node.js programs. That architecture has costs:

- **The God daemon** is a full Node.js process — V8 heap, the runtime, loaded modules. That's your 80 MB baseline, idle.
- **`pm2-logrotate`** is itself a *managed PM2 app* — another Node process, typically 30–50 MB, running just to rotate log files.
- **Per-app agents.** In cluster mode PM2 keeps IPC channels and metadata per worker; the bookkeeping grows with instance count.
- **Keymetrics/PM2 Plus instrumentation**, if enabled, adds an in-process agent that samples metrics.

None of this is a bug — it's the price of being a JavaScript daemon. But on a $6 VPS it adds up to 10–15% of RAM before line one of your code runs.

## Measure it properly

Don't trust one number. Look at the daemon and the log rotator separately:

```bash
# The God daemon
pm2 ls
ps -o rss= -p "$(pgrep -f 'PM2 v')" | awk '{print $1/1024 " MB"}'

# Everything PM2-related, including logrotate + workers
ps aux | grep -i pm2 | awk '{s+=$6} END {print s/1024 " MB total"}'
```

The second number is the honest one — it's what supervision actually costs you, separate from your app.

## Trimming PM2's footprint

If you want to stay on PM2, you can shave some off:

**1. Cap your apps, not the daemon.** `max_memory_restart` restarts *your* app when it leaks — it does nothing about the daemon, but it stops app growth:

```js
{ name: 'api', script: 'server.js', max_memory_restart: '400M' }
```

**2. Replace `pm2-logrotate` with the OS.** `logrotate(8)` costs zero resident memory versus a whole Node process. See [log management](/blog/nodejs-log-management) for a config.

**3. Right-size cluster instances.** `instances: 'max'` on a 4-core box spawns 4 workers *plus* PM2's per-worker overhead. If you're not CPU-bound, fewer instances frees real memory — check whether you even need [clustering](/blog/nodejs-clustering-multi-core).

**4. Disable metrics agents** you're not using (`pm2 set pm2:sysmonit false`, avoid PM2 Plus if unused).

**5. Update Node and PM2.** Newer V8 is more memory-efficient at idle.

Realistically this gets you from ~120 MB to ~70 MB. It doesn't remove the fundamental cost: a Node daemon supervising Node apps.

## Is it PM2, or is it your app?

Before blaming PM2, rule out the common confusion: a growing RSS on *your worker*, not the daemon. That's an application [memory leak](/blog/nodejs-memory-leaks-production), and switching process managers won't fix it. Use `pm2 ls` — if the number climbing is your app's, that's a code problem; if it's the God daemon that's flat-but-large, that's the supervision overhead this post is about.

## When to switch

If the daemon overhead itself is the problem — you're running many small services on small boxes, and 80 MB × N servers is a line item — a process manager without a runtime is the structural fix. [Oxmgr](/blog/introducing-oxmgr) is written in Rust, so there's no V8, no GC, and no per-process JavaScript agent:

| Metric | PM2 | Oxmgr |
|--------|-----|-------|
| Daemon memory | ~83 MB | ~4.2 MB |
| Per-process overhead | ~8 MB | ~0.3 MB |
| Log rotation | separate Node app | built in |

On that same 1 GB VPS, supervision drops from ~12% of RAM to well under 1%, and log rotation stops being a second process. Migration is a single import of your existing config — see the [PM2 → Oxmgr guide](/blog/migrate-from-pm2-to-oxmgr) — and it's reversible, so you can measure the difference on your own workload before committing.

## The short version

PM2's memory use is mostly the Node daemon plus `pm2-logrotate`, not a leak. You can trim it by moving log rotation to the OS, capping instances, and disabling unused agents — down to ~70 MB. To get *below* that you need a process manager that isn't itself a Node app. On big servers, nobody cares about 80 MB. On small ones, it's the whole reason lightweight process managers exist.
