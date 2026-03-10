---
title: What Is Crash Recovery? How Process Managers Keep Your App Online After Failures
description: Crash recovery is the ability to automatically restart a failed process before users notice. Learn how it works, what makes it fast or slow, and what to look for in a process manager.
date: 2026-03-10
tags: [crash-recovery, process-manager, node.js, reliability, devops]
keywords: [crash recovery, process crash recovery, automatic crash recovery, node.js crash recovery, process manager crash recovery, what is crash recovery, application crash restart, pm2 crash recovery]
author: Oxmgr Team
---

# What Is Crash Recovery?

Your production app crashes. A bug slips through, memory spikes, a network dependency times out and throws an unhandled exception — it doesn't matter why. What matters is what happens next.

**Crash recovery** is the automatic process of detecting that an application has died and restarting it as fast as possible, before your users have time to notice.

Without crash recovery, a process that crashes stays dead until a human intervenes. With it, the same crash can be invisible — the process restarts in milliseconds and keeps serving traffic.

## How Crash Recovery Works

Every operating system gives processes a way to signal their exit. When a process terminates — whether it crashes, runs out of memory, or is killed — it emits an exit event with a status code.

A process manager listens for these events:

```
App process exits (status: 1 — error)
        ↓
Process manager receives exit event
        ↓
Check: is this process configured to restart?
        ↓
Yes → spawn new process
        ↓
Wait for process to be ready (health check or port listen)
        ↓
Resume serving traffic
```

The critical variable is how long this takes. The gap between the exit event and the new process serving traffic is your **downtime window**.

## What Determines Recovery Speed

Three factors control how fast a process manager can recover from a crash:

### 1. The Manager's Own Runtime

A process manager written in a scripting language (JavaScript, Python, Ruby) has to do real work to respond to an exit event — the VM needs to be scheduled, the garbage collector might pause, the event loop might be busy.

A compiled binary (Rust, Go, C) responds in microseconds. There's no VM, no GC, no interpreter. The exit handler fires and the spawn call happens immediately.

This is the biggest factor. PM2 (Node.js daemon) recovers in ~400ms. Oxmgr (Rust binary) recovers in ~11ms.

### 2. Process Spawn Time

Spawning a new process takes time regardless of the manager. For a Node.js app:

- OS process creation: ~1–5ms
- Node.js startup: ~50–200ms (depending on module load time)
- Application initialization: varies

The process manager can't control how fast your app starts. But it can start the spawn immediately after detecting the crash, rather than waiting for polling intervals.

### 3. Health Check Configuration

After spawning, the manager needs to know when the process is ready. Two approaches:

**Port listening** — wait until the process binds to its port. Simple, but doesn't guarantee the app is actually serving valid responses.

**HTTP health check** — poll an endpoint until it returns 200. Slower to confirm readiness, but more accurate.

```toml
[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 2
timeout_secs = 5
```

For crash recovery, the key is not waiting *longer* than necessary. If your health check polls every 30 seconds but a crash recovers in 50ms, you're waiting 30 seconds to confirm what already happened.

## What Happens If an App Keeps Crashing?

Automatic restart can create a "crash loop" — the app restarts, crashes immediately, restarts again, endlessly. This is worse than staying down in some ways: it makes logs unreadable and consumes CPU spinning up processes.

Most process managers handle this with restart limits and backoff:

```toml
[processes.api]
max_restarts = 10          # stop trying after 10 crashes
restart_delay_ms = 500     # wait 500ms before each restart
```

Exponential backoff is more sophisticated — the delay doubles each time:
- Crash 1: restart after 100ms
- Crash 2: restart after 200ms
- Crash 3: restart after 400ms
- ...

This gives transient issues (network blips, temporary resource exhaustion) time to resolve while preventing runaway loops.

## Crash Recovery vs. High Availability

These are related but different concepts:

**Crash recovery** handles the period *after* a single process crashes — the goal is to minimize downtime for that process.

**High availability** uses redundancy to eliminate downtime entirely — run 2+ instances so when one crashes, others continue serving traffic while the crashed one recovers.

```toml
[processes.api]
instances = 3    # crash recovery on one instance doesn't affect the other 2
```

With 3 instances and 11ms crash recovery, a user hitting the crashed instance during that window is the only exposure. In practice, load balancers have already stopped routing to the crashed process within a similar timeframe.

## Measuring Crash Recovery in Your Setup

You can test your crash recovery speed manually:

```bash
# Find your process PID
oxmgr status

# Kill it hard (no graceful shutdown)
kill -9 <pid>

# Measure how long until it responds again
time curl --retry 100 --retry-delay 0 --retry-connrefused http://localhost:3000/health
```

For PM2 users, the same test will show you real-world recovery times rather than theoretical numbers.

## Crash Recovery in Oxmgr

Oxmgr is built around the assumption that crash recovery should be invisible to users. Key settings:

```toml
[processes.api]
command = "node dist/server.js"
restart_on_exit = true
restart_delay_ms = 0         # restart immediately
max_restarts = 20            # allow 20 restarts before giving up
instances = 2                # run 2 instances for redundancy

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 10
timeout_secs = 3
```

With this config, a crash on one instance triggers an immediate restart. The other instance handles traffic during the ~50ms window (11ms manager + ~40ms Node.js startup for a simple app).

See the [docs](/docs#health-checks) for health check configuration and resource limit triggers.
