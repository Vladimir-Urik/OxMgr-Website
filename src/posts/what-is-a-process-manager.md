---
title: What Is a Process Manager? (And Why Every Production Node.js App Needs One)
description: A process manager keeps your Node.js app running after crashes, restarts it on boot, and manages logs. Learn what it does, why you need one, and which to choose.
date: 2026-03-04
tags: [node.js, process-manager, production, devops]
keywords: [process manager, node.js process manager, what is a process manager, node.js production, keep node.js running, pm2, process management linux]
author: Oxmgr Team
---

You deploy your Node.js app. It runs fine. Then at 3am, an unhandled promise rejection crashes the process — and it stays down until someone notices at 9am.

A **process manager** prevents this. It wraps your application and:

- **Restarts it automatically** after a crash
- **Starts it on system boot** so you don't have to SSH in after every reboot
- **Manages logs** so you have a history of what went wrong
- **Monitors resource usage** and alerts you when something's off
- **Runs multiple instances** so you can use all your CPU cores

Without one, your "production" deployment is one uncaught exception away from downtime.

## Why `node server.js` Isn't Enough

Running your app directly has three fatal problems in production:

**1. No crash recovery.** When the process dies, it stays dead. If you're not watching, your users are getting connection refused errors.

**2. No persistence across reboots.** Every time your VPS restarts — for kernel updates, power cycles, maintenance windows — you have to manually restart your app.

**3. No structured logging.** stdout and stderr go nowhere useful. You can't grep for errors from last Tuesday.

You might think: "I'll just use a shell script with a while loop." That works until you need log rotation, multiple processes, or zero-downtime deploys.

## What a Process Manager Actually Does

Here's what happens when you start an app with a proper process manager:

```
┌─────────────────────────────────────────┐
│              Process Manager             │
│                                          │
│  ┌──────────┐  ┌──────────┐             │
│  │  App #1  │  │  App #2  │  ... cores  │
│  └──────────┘  └──────────┘             │
│       ↓              ↓                   │
│   [crashed]     [running]                │
│       ↓                                  │
│   [restart in ~10ms]                     │
└─────────────────────────────────────────┘
```

The manager sits between your OS and your app. It catches exits, logs them, and respawns the process. From your user's perspective, the app was down for 10 milliseconds.

## The Three Things That Matter

When evaluating a process manager, focus on:

### 1. Crash Recovery Speed

The faster a process manager restarts a crashed app, the less downtime your users see. Most Node.js process managers restart in 300–1500ms. Oxmgr restarts in ~11ms. The difference is whether the manager itself runs in a slow VM (Node.js) or a compiled binary (Rust).

### 2. Memory Overhead

The process manager runs 24/7. Its memory usage is permanently subtracted from your server budget. PM2 uses ~80MB at rest. On a $6/month VPS with 1GB RAM, that's 8% of your available memory doing nothing but managing your app.

Oxmgr uses ~4MB. That's 20× less RAM for the manager, leaving more headroom for your actual application.

### 3. Configuration as Code

The best process managers let you define everything in a config file you can version-control:

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
instances = 2
env = { NODE_ENV = "production", PORT = "3000" }
restart_delay_ms = 100
watch = ["dist"]
```

This means your process manager configuration lives in git alongside your code. No more "what flags was it running with?" mysteries.

## Common Process Managers Compared

| Feature | PM2 | Systemd | Forever | Oxmgr |
|---------|-----|---------|---------|-------|
| Crash recovery | ✓ | ✓ | ✓ | ✓ |
| Memory overhead | ~80 MB | ~0 MB | ~30 MB | ~4 MB |
| Restart speed | ~400 ms | ~200 ms | ~500 ms | ~11 ms |
| Config as code | ✓ | Partial | ✗ | ✓ |
| Cross-platform | ✓ | Linux only | ✓ | ✓ |
| Log management | ✓ | Via journald | Basic | ✓ |
| Zero-config | ✓ | ✗ | ✓ | ✓ |

**PM2** is the most widely used and has the richest ecosystem. If you're already using it and it's working, there's no urgent reason to switch.

**Systemd** is excellent but Linux-only and requires learning its unit file syntax. Great for production servers you control, less useful for local dev.

**Forever** is minimal and old — avoid for new projects.

**Oxmgr** is built for performance-sensitive environments where startup time and memory matter.

## When You Need a Process Manager

You need one **the moment you deploy to a server**. Not when you scale. Not when you have paying customers. From day one.

The operational cost of not having one is too high. A crashed process at 3am that costs you a customer is more expensive than the 10 minutes it takes to set up a process manager today.

## Getting Started with Oxmgr

Install with npm:

```bash
npm install -g oxmgr
```

Create an `oxfile.toml` in your project:

```toml
[processes.app]
command = "node server.js"
restart_on_exit = true
```

Start it:

```bash
oxmgr start
```

That's it. Your app now survives crashes, system reboots, and you forgetting it exists.

Check the [documentation](/docs) for health checks, resource limits, and multi-process configurations.
