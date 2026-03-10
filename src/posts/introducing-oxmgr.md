---
title: Introducing Oxmgr — A Rust Process Manager Built for Developers Who Care About Overhead
description: We built Oxmgr because PM2 was costing too much RAM and starting too slowly. Here's what we made, why it's different, and how to get started in under two minutes.
date: 2026-03-06
tags: [announcement, rust, process-manager, pm2-alternative]
keywords: [oxmgr, rust process manager, pm2 alternative rust, lightweight process manager, fast process manager, node.js process manager rust, oxmgr announcement]
author: Oxmgr Team
---

We got tired of PM2 eating 80MB of RAM before our app even started.

On a $6/month VPS with 1 GB of memory, that's 8% of the machine doing nothing but keeping processes alive. Multiplied across dozens of servers, it becomes a meaningful cost. And when something crashed, the 400ms recovery window was visible in our error rates.

So we built **Oxmgr** — a process manager written in Rust that starts in 38ms and uses 4MB at rest.

## What Made Us Build This

The core problem isn't that PM2 is bad. It's excellent for what it is: a JavaScript daemon that manages JavaScript processes. But "JavaScript daemon" means it carries the weight of Node.js everywhere it goes.

If you're not familiar with what a process manager does in the first place, the [process manager primer](/blog/what-is-a-process-manager) is a good starting point before continuing here.

We wanted something with no runtime, no garbage collector, and no V8 warmup between your processes crashing and restarting. Rust was the obvious choice.

## What Oxmgr Does

Oxmgr manages long-running processes through a single config file, `oxfile.toml`:

```toml
[processes.api]
command = "node dist/server.js"
instances = 4
env = { NODE_ENV = "production", PORT = "3000" }
restart_on_exit = true
restart_delay_ms = 100
watch = ["dist"]

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30

[processes.worker]
command = "python worker.py"
restart_on_exit = true
max_restarts = 5
```

`oxmgr start` brings everything up. `oxmgr status` shows you what's running. `oxmgr reload` does a rolling restart with zero downtime.

It's not just for Node.js — Oxmgr manages any process: Python scripts, Go binaries, Ruby apps, compiled Rust services.

## The Numbers

On identical hardware (AWS t3.small), managing 10 Node.js processes:

| Metric | PM2 | Oxmgr |
|--------|-----|-------|
| Daemon memory | 83 MB | 4.2 MB |
| Cold startup | 1,240 ms | 38 ms |
| Crash recovery | 410 ms | 11 ms |
| Per-process overhead | ~8 MB | ~0.3 MB |

The crash recovery number is what we're most proud of. 11ms is below the threshold of a single HTTP request timeout. Your users don't see the crash.

## What's Different From PM2

**Config file instead of CLI flags.** Everything is in `oxfile.toml`, committed to git, reviewed in PRs. No more wondering what flags the process was started with.

**Written in Rust.** No Node.js dependency, no npm version conflicts, no `pm2 update` ceremony. Oxmgr is a single binary.

**PM2 migration in one command.** If you have an `ecosystem.config.js`, run:

```bash
oxmgr import ecosystem.config.js
```

It generates an equivalent `oxfile.toml` for review.

## Getting Started

Install via npm:

```bash
npm install -g oxmgr
```

Or with brew on macOS:

```bash
brew install oxmgr
```

Create an `oxfile.toml`:

```toml
[processes.app]
command = "node server.js"
restart_on_exit = true
```

Start:

```bash
oxmgr start
```

That's two minutes from zero to crash-recovering production-ready process management.

## What's Coming

We're actively building:

- **TUI dashboard** — real-time terminal UI with resource graphs
- **Git webhooks** — auto-deploy on push without a CI pipeline
- **System service integration** — register processes as systemd/launchd units with one command
- **Resource limits** — cap CPU and memory per process, restart on limits exceeded

Follow the project on [GitHub](https://github.com/Vladimir-Urik/OxMgr). If you try it, open an issue — we want to hear what you're running and what you need.
