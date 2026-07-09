---
title: Surviving the OOM Killer — Memory Limits and Auto-Restart on Linux
description: Why the Linux OOM killer sends SIGKILL, how to tell when it's happening, and how to defend your app with per-process memory limits, restart policies, and cgroups instead of losing the whole box.
date: 2026-09-18
tags: [linux, oom-killer, memory, resource-limits, process-manager, devops]
keywords: [linux oom killer, oom killer nodejs, process killed sigkill memory, cgroup memory limit, out of memory killer, memory limit restart, prevent oom kill]
author: Oxmgr Team
---

# Surviving the OOM Killer

Your app was fine, then it just vanished — no stack trace, no error, gone. In the logs, `SIGKILL` and nothing else. That's almost always the Linux OOM (Out Of Memory) killer, and it's one of the most confusing production failures precisely because it leaves no evidence in your app. Here's what it is, how to confirm it, and how to defend against it.

## What the OOM killer does

When Linux runs out of physical memory and swap, it doesn't return "out of memory" to whoever asked — it picks a process and kills it with `SIGKILL` to reclaim RAM and keep the whole system from locking up. `SIGKILL` (signal 9) is uncatchable, so the victim gets *no chance* to clean up or log anything. That's why an OOM kill looks like the process teleported out of existence.

The kernel picks its victim by an "OOM score" that roughly favors killing large-memory processes — which is often your app, not the leak that actually caused the pressure.

## Confirming it's an OOM kill

Before you fix anything, confirm the diagnosis:

```bash
# Kernel's own record of the killing
dmesg -T | grep -i -E 'killed process|out of memory'
journalctl -k | grep -i oom

# Per-cgroup OOM events (systemd services)
systemctl status your-service | grep -i oom
```

The telltale signature from your process manager's side: a [crash event](/blog/debug-crashes-stderr-tail) with `signal: "SIGKILL"` and an **empty `stderr_tail`**. No traceback + SIGKILL = the kernel killed it, not your code. (A `SIGKILL` *with* a traceback usually means something else force-killed it.) That empty-tail-plus-SIGKILL pattern is the single fastest way to distinguish an OOM kill from an application crash.

## Defense 1: cap memory per process, restart on breach

The best defense is to *not let one process eat the whole box*. Cap each process's memory and have your supervisor restart it when it crosses the line — a controlled recycle instead of a kernel execution. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.api]
command = "node dist/server.js"
restart_on_exit = true

[processes.api.limits]
memory = "500M"     # restart this process if it exceeds 500 MB
```

Now a [leaking process](/blog/nodejs-memory-leaks-production) gets restarted *by your process manager* at 500 MB — cleanly, with a normal restart event and logs — long before it starves the system and triggers the kernel's blunt instrument. This is the same idea as PM2's `max_memory_restart`, and it's the most important single line of defense. See [resource limits](/blog/nodejs-resource-limits-production) for the full options.

## Defense 2: help the runtime respect the limit

Some runtimes over-allocate unless told the ceiling:

- **Node:** set `--max-old-space-size` to below your process cap so V8 does GC pressure before the manager or kernel steps in: `node --max-old-space-size=400 server.js` (for a 500 MB cap).
- **JVM:** use `-XX:MaxRAMPercentage` and `-XX:+ExitOnOutOfMemoryError` so an `OutOfMemoryError` becomes a clean exit the supervisor can restart — see [Spring Boot in production](/blog/spring-boot-production-deployment).
- **Python/Celery:** `--max-memory-per-child` recycles workers before they bloat — see [Celery workers](/blog/celery-workers-production).

## Defense 3: right-size the box and add swap as a cushion

If the whole machine is genuinely too small, no limit saves you — you'll just restart-loop. Two structural fixes:

1. **Size for memory.** Add up your real per-process RSS and add headroom — the method is in [How Much VPS Do You Actually Need?](/blog/how-much-vps-do-you-need). Undersizing RAM is the root cause behind most OOM kills.
2. **Add a little swap** as a shock absorber (not a substitute for RAM):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
```

Swap buys you time to restart gracefully instead of getting instantly killed during a brief spike. But if you're *constantly* in swap (`vmstat 1` shows steady `si`/`so`), that's a "buy more RAM" signal, not a fix.

## Defense 4: catch it early with metrics

The OOM killer strikes at 100% memory; you want to know at 80%. A [memory-per-process Grafana panel](/blog/prometheus-grafana-process-metrics) or a periodic `oxmgr ls --json | jq` [check](/blog/process-manager-json-jq-scripting) turns a sudden 2 a.m. kill into a gentle upward trend you address during business hours.

## Putting it together

The layered defense:

1. **Cap memory per process** → the manager recycles a bloated process before the kernel does.
2. **Tell the runtime the limit** (`--max-old-space-size`, `MaxRAMPercentage`) → GC works before the cap.
3. **Right-size RAM + a swap cushion** → the box isn't fundamentally too small.
4. **Alert on memory trend** → you see it coming.

Get those in place and the OOM killer stops being a mysterious vanishing act. Instead of the kernel picking a victim and `SIGKILL`-ing it with no trace, your process manager does a clean, logged, health-gated restart of exactly the process that misbehaved — and you find out from a graph, not from your users.
