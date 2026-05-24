---
title: Running Bun in Production — Process Management, Restarts, and What Nobody Tells You
description: Bun is fast, but running it in production needs more than `bun run server.ts`. Here's how to keep Bun apps alive, restart them after crashes, and survive deploys without dropping connections.
date: 2026-06-01
tags: [bun, process-manager, production, javascript, devops]
keywords: [bun process manager, bun production deployment, run bun in production, bun pm2, bun restart on crash, bun systemd, bun server keep alive, bun vs node production]
author: Oxmgr Team
---

# Running Bun in Production

Bun starts in milliseconds, runs TypeScript natively, and beats Node.js on most synthetic benchmarks. That's the sales pitch. What the docs rarely cover is the boring part: how to keep `bun run server.ts` alive at 3 AM when something panics, how to deploy a new version without dropping in-flight requests, and how to read CPU and memory of a Bun process the same way you would for Node.

This guide is about that boring part.

## The Default Setup Is Not Production

Most Bun tutorials end the deployment story at:

```bash
bun install --production
bun run server.ts
```

That works until the first uncaught exception, the first OOM kill, or the first time you SSH into a box and find the process gone. Production needs three things on top:

1. **Supervision** — something restarts the process when it dies.
2. **Logging** — stdout and stderr go somewhere persistent.
3. **Lifecycle control** — start, stop, reload, and inspect without guessing PIDs.

You can wire these together with systemd unit files, or you can use a process manager. Both work; one is faster to set up.

## Option 1: systemd

systemd is on every modern Linux box, costs nothing extra, and is well understood. A minimal unit file for a Bun app:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Bun API
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/myapp
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/home/deploy/.bun/bin/bun run server.ts
Restart=always
RestartSec=2
StandardOutput=append:/var/log/myapp/out.log
StandardError=append:/var/log/myapp/err.log

[Install]
WantedBy=multi-user.target
```

Reload and enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
```

The trade-off: editing services means `sudo`, reloading the daemon, and a learning curve when you want resource limits, health checks, or per-process env files. If you're running one app on one box, it's fine. If you're running five, the config sprawl gets old.

## Option 2: A Process Manager

A process manager bundles supervision, logging, and lifecycle into a single config file. PM2 is the most common choice in the Node world, but PM2 itself runs on Node — which means installing Node just to manage your Bun process. That defeats the point.

[Oxmgr](https://oxmgr.empellio.com) is written in Rust, has no JavaScript runtime dependency, and treats Bun as a first-class command:

```toml
# oxfile.toml
[processes.api]
command = "bun run server.ts"
cwd = "/srv/myapp"
env = { NODE_ENV = "production", PORT = "3000" }
restart = "on-failure"
max_restarts = 10

[processes.api.health]
type = "http"
url = "http://127.0.0.1:3000/health"
interval = "10s"
timeout = "2s"
```

Then:

```bash
oxm start
oxm status
oxm logs api --follow
```

The advantage over systemd is iteration speed and consistency across apps. The advantage over PM2 is no Node runtime in the way — Bun is the only JavaScript on the box.

If you're new to process managers in general, the [process manager primer](/blog/what-is-a-process-manager) covers the concept end-to-end.

## Graceful Shutdown in Bun

Bun supports the same `SIGTERM`/`SIGINT` signal handling as Node. The pattern:

```ts
const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  fetch(req) {
    return new Response("hello");
  },
});

const shutdown = async () => {
  console.log("draining...");
  server.stop(false); // false = let in-flight requests finish
  // close DB, flush logs, etc.
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

The `false` flag on `server.stop()` is the important bit. Without it, Bun closes connections immediately and any in-flight requests get truncated. With it, the server stops accepting new connections but lets active ones complete.

Whatever supervisor you use, configure it to send `SIGTERM` first and wait at least 10–15 seconds before escalating to `SIGKILL`. systemd does this by default with `TimeoutStopSec`; Oxmgr does it with `stop_signal` and `stop_timeout`. The full pattern is covered in the [Node.js graceful shutdown guide](/blog/nodejs-graceful-shutdown-complete-guide) — almost everything there applies to Bun verbatim.

## Restarts and Backoff

Bun crashes look like Node crashes: a non-zero exit code, possibly a stack trace. The default response should be to restart — but not in a tight loop. If your process is dying because port 3000 is taken, restarting it 200 times per second will fill your log disk before you finish your coffee.

Both systemd (`RestartSec`) and Oxmgr (`restart_delay`, `max_restarts`) support backoff and circuit breakers. Pick numbers that match your tolerance: a 2-second base delay with a cap of 10 restarts per minute is sane for most APIs.

## Memory and CPU Limits

Bun's per-process memory floor is lower than Node's, but a leak is still a leak. Set hard limits so a runaway process doesn't take the whole box with it.

systemd:

```ini
[Service]
MemoryMax=512M
CPUQuota=200%
```

Oxmgr:

```toml
[processes.api.limits]
memory = "512M"
cpu = "200%"
```

Both will SIGKILL the process if it exceeds memory — which is what you want. The alternative is the OOM killer picking a victim at random, which on a multi-tenant VPS might be the wrong process. More on this in the [resource limits guide](/blog/nodejs-resource-limits-production).

## Logging

Bun writes to stdout and stderr like any Unix process. Don't reinvent it. Let your supervisor capture the streams and rotate the files. The two questions to answer up front:

- **Where do logs live?** A predictable path like `/var/log/myapp/` is better than scattered tmp files.
- **Who rotates them?** `logrotate` on systemd, built-in rotation on Oxmgr. Either way, configure it before your log file hits 50 GB.

The detailed pattern is in the [Node.js log management guide](/blog/nodejs-log-management) — again, all of it applies to Bun.

## What About `bun --hot`?

`bun --hot` is the development reloader. It is not for production. It assumes a single developer, a single process, and it doesn't handle the "in-flight request" problem at all. In production, treat code changes as deploys: stop the old process, swap the binary or files, start the new one. If you need zero-downtime, use two processes behind a reverse proxy and shift traffic over — the same blue-green pattern covered in the [zero-downtime deployment guide](/blog/zero-downtime-deployment).

## Common Pitfalls

- **Running as root.** Bun's network APIs don't need root. Create a deploy user, give it ownership of `/srv/myapp`, and run as that user.
- **Missing `bun install --production` on the server.** Dev dependencies in production wastes RAM and increases attack surface.
- **No health check.** Without one, your supervisor only knows about process death. It can't tell you that the process is running but stuck on a deadlocked DB pool. The [health check guide](/blog/nodejs-health-checks) covers the endpoint contract.
- **PATH issues in unit files.** `bun` is often in `~/.bun/bin/`. systemd doesn't source your shell profile, so use the full path.

## Bottom Line

Bun in production is Node in production with a different binary name. The disciplines are the same: supervise it, log it, limit it, drain it cleanly. Whether you use systemd or a process manager comes down to how many services you run and how often you change them. For one app: systemd is fine. For more: a single `oxfile.toml` you can read top-to-bottom is the better deal.

If you want to try the Oxmgr path, the [install instructions](/) take about a minute and don't require Node anywhere on the box.
