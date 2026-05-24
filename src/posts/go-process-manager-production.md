---
title: Running Go Apps in Production — Do You Even Need a Process Manager?
description: Go binaries are single files with no runtime. So do you need a process manager at all? Sometimes yes, sometimes no — here's how to decide and what to use.
date: 2026-06-08
tags: [golang, go, process-manager, production, devops, systemd]
keywords: [go process manager, golang production deployment, go systemd, run go binary in production, go app supervisor, go service restart, deploy go to vps, go application monitoring]
author: Oxmgr Team
---

# Running Go Apps in Production

A common opinion in the Go community: "you don't need a process manager, just use systemd." It's not wrong. Go binaries are static, the runtime is bundled, there's no `node_modules` to install. systemd handles supervision, restarts, and logging. For a single service on a single box, that's a complete answer.

The question is what happens when "a single service on a single box" stops being the whole picture. This post walks through both sides — when systemd is enough, when something else helps, and how the production discipline looks either way.

## What systemd Gives You

A minimal Go service unit file:

```ini
# /etc/systemd/system/api.service
[Unit]
Description=My Go API
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/myapp
EnvironmentFile=/srv/myapp/.env
ExecStart=/srv/myapp/bin/api
Restart=on-failure
RestartSec=2
TimeoutStopSec=30
KillSignal=SIGTERM
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

That gives you:

- Restarts on non-zero exit (not on clean exits — important for jobs).
- Logs to journald, queryable with `journalctl -u api -f`.
- A clean lifecycle: `systemctl start`, `stop`, `restart`, `reload`.
- File descriptor limits set per service.
- `SIGTERM` first, escalation after 30 seconds — long enough for HTTP servers to drain.

For one service this is fine. The pain starts when you have ten.

## Where systemd Gets Painful

Three things consistently come up:

**Editing requires sudo.** Every change to a unit file means `sudoedit /etc/systemd/system/api.service` followed by `systemctl daemon-reload`. That's annoying as a deploy step and harder to put in CI.

**Per-app state is scattered.** Logs are in journald, the unit is in `/etc/systemd/system/`, the binary is in `/srv/myapp`, the env file is somewhere else. There's no single "what's running and how" view without scripting.

**Multi-process coordination is awkward.** If your Go app has a worker process and an API process, that's two unit files plus a target to group them. Restarting "the app" means knowing which unit names to touch.

For one app, you absorb the friction. For five, it adds up.

## The Process Manager Alternative

A process manager treats "the app" as a config file. [Oxmgr](https://oxmgr.empellio.com) is written in Rust, runs as a single binary, and doesn't care what language your service is written in:

```toml
# oxfile.toml
[processes.api]
command = "./bin/api"
cwd = "/srv/myapp"
env_file = ".env"
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "30s"

[processes.api.health]
type = "http"
url = "http://127.0.0.1:8080/health"
interval = "10s"

[processes.worker]
command = "./bin/worker"
cwd = "/srv/myapp"
env_file = ".env"
restart = "always"

[processes.worker.limits]
memory = "256M"
```

`oxm start` brings them up. `oxm status` shows both. `oxm logs --follow` tails everything. The config lives in your repo next to the code.

The trade-off is one more dependency on the box. If you're already comfortable with systemd and you only have one service, the win is small. If you have several, or you want the same config to work on your laptop and your server, the win is real.

If you're new to the concept entirely, the [process manager primer](/blog/what-is-a-process-manager) explains what these tools actually do.

## Graceful Shutdown in Go

Go's standard library makes this easy — but you still have to write the code. The pattern:

```go
package main

import (
    "context"
    "errors"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
)

func main() {
    srv := &http.Server{
        Addr:    ":8080",
        Handler: routes(),
    }

    go func() {
        if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
            log.Fatalf("listen: %v", err)
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
    <-quit

    log.Println("shutting down...")
    ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
    defer cancel()
    if err := srv.Shutdown(ctx); err != nil {
        log.Fatalf("forced shutdown: %v", err)
    }
}
```

The 25-second context is intentionally shorter than systemd's `TimeoutStopSec=30`. You want your app to finish draining before the supervisor escalates to `SIGKILL` — not the other way around.

The general principles are covered in the [graceful shutdown guide](/blog/nodejs-graceful-shutdown-complete-guide); the Go code is different but the lifecycle is identical.

## Resource Limits

Go apps usually have predictable memory profiles — they don't grow like Node sometimes does. But predictable doesn't mean bounded. A goroutine leak, a slice that keeps appending, or a runaway request can still chew through RAM.

Set a hard memory cap so a leak becomes a clean restart instead of a server-wide OOM event:

systemd:
```ini
MemoryMax=512M
```

Oxmgr:
```toml
[processes.api.limits]
memory = "512M"
```

Go has a related runtime knob worth knowing: `GOMEMLIMIT`. Set it to ~90% of your hard cap and the runtime will GC more aggressively as it approaches the limit, often avoiding the OOM kill entirely:

```ini
Environment=GOMEMLIMIT=460MiB
```

That's a Go-specific play — the [resource limits post](/blog/nodejs-resource-limits-production) covers the supervisor side.

## Health Checks

Go HTTP servers should expose `/health` for the same reasons Node servers do: your supervisor needs to know more than "is the process alive." A typical implementation:

```go
mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    if err := db.PingContext(r.Context()); err != nil {
        http.Error(w, "db down", http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("ok"))
})
```

Both systemd (with `ExecStartPost` and watchdog) and Oxmgr (with `[processes.api.health]`) can use this to trigger restarts when the process is alive but unhealthy. Full pattern in the [health checks guide](/blog/nodejs-health-checks).

## Zero-Downtime Deploys

Go's static binaries make blue-green deploys clean. The pattern:

1. Build new binary to `bin/api.new`.
2. Atomically rename: `mv bin/api.new bin/api`.
3. Reload the supervisor.

For a single instance, "reload" means `SIGTERM` to the old process, then start the new one — the brief gap is usually fine for non-critical APIs. For true zero-downtime, run two instances behind a reverse proxy and shift traffic. The [zero-downtime deployment guide](/blog/zero-downtime-deployment) is language-agnostic and applies directly.

## When systemd Is The Right Answer

- One Go service on one box.
- You're already deeply familiar with systemd.
- You want zero additional dependencies.
- The service is set-and-forget — rarely deployed, rarely changed.

## When a Process Manager Pays Off

- Multiple services on one box (API + worker + cron).
- You want the same config to describe production and your laptop.
- You deploy often and want the supervisor config in git.
- You want consistent log handling, restart policy, and health checks across all services.

## A Note on Container Workflows

If you're shipping Go in a container, the process manager question shifts: the container runtime *is* your supervisor. ECS, Kubernetes, Nomad, or `docker run --restart=on-failure` covers the same job. Inside the container, you want exactly one process, not a process manager — see the [Docker vs process manager post](/blog/nodejs-docker-vs-process-manager) for the long version.

But on a bare VPS — which is still where most small Go services live — supervision is your problem to solve.

## Bottom Line

Go doesn't need a process manager the way Node does. The runtime isn't fighting you. But "doesn't need" isn't the same as "doesn't benefit." If you've outgrown one-app-per-box and your unit files are starting to feel like sprawl, a process manager turns the config back into something you can read in one screen.

[Oxmgr](https://oxmgr.empellio.com) is built for exactly this case: small fleet, mixed languages, supervisor that costs less than the apps it manages.
