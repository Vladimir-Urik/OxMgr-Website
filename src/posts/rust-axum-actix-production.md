---
title: Deploying a Rust Web Service (Axum/Actix) in Production — Do You Need a Supervisor?
description: Rust web services are famously stable, so do you even need a process manager? A look at building a release binary, what still crashes, graceful shutdown, and when supervision earns its place.
date: 2026-10-03
tags: [rust, axum, actix, production, process-manager, devops]
keywords: [rust axum production deployment, actix web production, deploy rust binary production, rust process manager, rust web service systemd, rust graceful shutdown, rust web server supervisor]
author: Oxmgr Team
---

# Deploying a Rust Web Service in Production

Rust web services have a reputation for being boringly reliable — no garbage collector, no runtime, memory safety enforced at compile time. So a fair question: do you even need a process manager for an Axum or Actix service, or is that a Node-world habit that doesn't apply? The honest answer is "less than you think, but not zero." Let's deploy one properly and see where supervision actually earns its place.

## Step 1: Build a release binary

Rust's deployment story is its best feature: one statically-ish linked binary, no runtime to install.

```bash
cargo build --release
# → target/release/myservice
```

For maximum portability across Linux boxes, build against musl for a truly static binary:

```bash
rustup target add x86_64-unknown-linux-musl
cargo build --release --target x86_64-unknown-linux-musl
```

Now you can `scp` a single file to the server and run it — no `apt install`, no version managers. (This is the same reason [Oxmgr itself ships a musl binary](/blog/introducing-oxmgr): static Rust binaries just *run*.)

## Step 2: What actually still crashes

Rust eliminates whole categories of failure, but a production Rust service is not immune:

- **`panic!` in a handler** — an `unwrap()` on a `None`, an array index out of bounds, a failed `expect()`. By default this unwinds the panicking task; with `panic = "abort"` (common in release) it takes the *process* down.
- **The OOM killer** — Rust uses far less memory than a JVM, but a service that buffers large uploads or has an unbounded cache can still get [SIGKILL-ed](/blog/linux-oom-killer-nodejs). Memory safety ≠ memory *bounded*.
- **Deadlocks / poisoned mutexes** — a `Mutex` poisoned by a panic in another thread, or a genuine deadlock, leaves the process alive but not serving. A [health check](/blog/nodejs-health-checks) catches this; "is the process alive?" does not.
- **Upstream dependency failures** — the database goes away, a connection pool exhausts, the service starts returning 500s.
- **Reboots** — the kernel updates at 4 a.m. and your binary needs to come back.

So the crash rate is *low*, but "low" over months of uptime and many deploys is not "never." And several of these (deadlock, upstream failure) aren't crashes at all — they're the process being unhealthy while alive, which is exactly what a health-gated supervisor is for.

## Step 3: Graceful shutdown (don't skip this)

The one thing you *must* implement regardless of supervisor is graceful shutdown, so deploys don't drop in-flight requests. Both Axum and Actix support it. For Axum:

```rust
let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;
axum::serve(listener, app)
    .with_graceful_shutdown(shutdown_signal())
    .await?;

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.expect("failed to listen for ctrl_c");
    // also handle SIGTERM on Unix — that's what supervisors send
}
```

Handle **`SIGTERM`** specifically — that's the signal a process manager or systemd sends to ask for a clean stop. Without it, a deploy's stop is a hard kill mid-request. The concept is identical to [Node's graceful shutdown](/blog/nodejs-graceful-shutdown-complete-guide): stop accepting, drain, exit.

## Step 4: systemd or a process manager?

For a **single** Rust service, plain systemd is a completely reasonable answer — it restarts on crash and survives reboots, and it's already there:

```ini
[Service]
ExecStart=/srv/app/myservice
Restart=always
User=appuser
TimeoutStopSec=30
```

Choose a **process manager instead** when you want things systemd makes awkward:

- **[HTTP health checks](/blog/nodejs-health-checks)** that catch the deadlock/poisoned-mutex case, not just process death.
- **Health-gated [zero-downtime reloads](/blog/zero-downtime-deployment)** for deploys.
- **[One config file](/blog/oxfile-toml-complete-guide)** describing a whole stack — say, a Rust API plus a [Node frontend](/blog/sveltekit-self-hosting) plus a worker — in git.
- **A [real-time event stream](/blog/process-manager-event-bus)** for [crash alerts](/blog/crash-alerts-slack-discord) with the panic message in `stderr_tail`.

With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.api]
command = "/srv/app/myservice"
user = "appuser"
restart_on_exit = true
stop_signal = "SIGTERM"
stop_timeout_ms = 30000

[processes.api.env]
RUST_LOG = "info"
RUST_BACKTRACE = "1"

[processes.api.health_check]
endpoint = "http://localhost:8080/health"
interval_secs = 30
```

Set **`RUST_BACKTRACE=1`** so that when a panic *does* take the process down, the backtrace lands on stderr — and therefore in the crash event's [`stderr_tail`](/blog/debug-crashes-stderr-tail), giving you the panic location in your Slack alert instead of "it exited."

## Step 5: Reverse proxy, as always

Bind the service to loopback and put Caddy/nginx in front for TLS and to keep it off privileged ports — same as any service, covered in the [nginx + SSL guide](/blog/nodejs-vps-setup-nginx-ssl) and the [non-root user](/blog/run-nodejs-as-non-root) post.

## The honest verdict

Do you *need* a process manager for a Rust service? For a single, simple service, systemd is enough, and you should feel no guilt using it. You start wanting a dedicated process manager when you have **more than one service**, when you want **health checks that catch a wedged-but-alive process**, when you deploy often enough that **health-gated zero-downtime reloads** matter, or when you want a Rust API to sit in the **same supervised, observable stack** as your other-language services. Rust lowers the *crash* frequency dramatically — it doesn't remove the operational needs of *deploying, health-checking, and observing* a long-running service. That's the part a process manager was always really about.
