---
title: PM2 vs Systemd — Which Should You Use to Run Node.js in Production?
description: PM2 and systemd are both used to keep Node.js apps running in production, but they solve different problems. Here's when to use each — and why combining them (or replacing PM2 with Oxmgr) gives you the best of both worlds.
date: 2026-03-13
tags: [pm2, systemd, node.js, linux, process-manager, comparison]
keywords: [pm2 vs systemd, pm2 or systemd, systemd node.js, pm2 systemd, node.js production systemd, pm2 vs systemd node, run node.js with systemd, pm2 replacement systemd, node.js linux service]
author: Oxmgr Team
---

# PM2 vs Systemd — Which Should You Use?

This is one of the most debated questions in Node.js production deployments. The answer is: they solve different problems, and the real question is whether you need one, the other, or both.

Let's break it down properly.

## What Each Tool Actually Does

**Systemd** is the init system — PID 1 on virtually every modern Linux distribution. It starts all system services at boot and manages them at the OS level. It has no idea that Node.js exists. It just knows how to start processes, restart them on failure, collect their output, and control their resources via cgroups.

**PM2** is an application-level process manager written in Node.js. It knows about Node.js specifically: it can run apps in cluster mode, inject monitoring into processes, manage log files, and generate systemd unit files on your behalf.

**The core difference:** systemd manages OS services. PM2 manages Node.js apps. These overlap significantly, which is where the confusion comes from.

## Head-to-Head Comparison

### Crash Recovery

Both restart crashed processes automatically.

```ini
# systemd
[Service]
Restart=on-failure
RestartSec=5
```

```bash
# PM2
pm2 start app.js --restart-delay 5000
```

**Winner: Tie** for basic crash recovery. Systemd is slightly faster (~180ms vs ~410ms for PM2) because it has no Node.js runtime overhead. (For a deeper look at what crash recovery is and why the numbers matter, see [What Is Crash Recovery?](/blog/what-is-crash-recovery).)

### Boot Persistence

Systemd is the boot system — everything starts via systemd at boot. PM2 works around this by generating a systemd unit file that starts the PM2 daemon, which then starts your apps.

```bash
# PM2 approach — generates a unit that starts PM2 daemon at boot
pm2 startup systemd
pm2 save

# Systemd direct approach — your app IS the unit
sudo systemctl enable myapp
```

**Winner: Systemd.** PM2's approach is a hack layered on top of systemd. Running PM2 under systemd means two layers of process management, each with its own restart logic and logging.

### Cluster Mode (Multi-Core)

This is PM2's biggest advantage over plain systemd.

```bash
# PM2 — trivially simple
pm2 start app.js -i max  # one process per CPU core
```

```ini
# Systemd — no built-in cluster support
# You'd need to run N identical units or use your app's cluster module
```

**Winner: PM2.** Systemd has no concept of clustering. To use all CPU cores with systemd alone, you need either Node.js's built-in cluster module in your app code or a template unit running multiple copies with different ports behind a load balancer.

### Memory and CPU Overhead

```
PM2 daemon:     ~83 MB RAM, ~0.8% CPU at idle
Systemd:        ~0 MB additional (already part of PID 1)
```

On a 1 GB VPS, PM2's daemon costs 8% of your available RAM doing nothing. Systemd costs nothing extra.

**Winner: Systemd** — by a wide margin on constrained hardware.

### Log Management

```bash
# PM2 — log files in ~/.pm2/logs/, rotation built in
pm2 logs app
pm2 flush  # clear logs

# Systemd — logs go to journald, the system journal
journalctl -u myapp -f
journalctl -u myapp --since "1 hour ago" -n 100
journalctl -u myapp -p err  # only errors
```

Both work. Journald is more powerful for querying but requires learning journalctl. PM2 logs are simpler plain text files.

**Winner: Tie.** Depends on your preference and tooling.

### Zero-Downtime Deploys

```bash
# PM2 — built-in rolling reload
pm2 reload app

# Systemd — no built-in rolling restart
# You'd need to implement it yourself or use a wrapper script
sudo systemctl restart myapp  # this causes downtime
```

**Winner: PM2.** Systemd has no zero-downtime reload mechanism for multi-instance setups. You'd need to implement it yourself with a script.

### Config Portability

```bash
# PM2 — ecosystem.config.js travels with your repo
git add ecosystem.config.js

# Systemd — unit files live in /etc/systemd/system/, not your repo
# They're server-specific and require sudo to install
```

**Winner: PM2.** Your PM2 config is version-controlled with your app. Systemd unit files are OS configuration that lives outside your repo and requires privileged installation.

### Cross-Platform

```
PM2:    Linux ✓, macOS ✓, Windows ✓
Systemd: Linux only
```

**Winner: PM2** if you need to run on macOS dev machines or Windows servers.

## Feature Comparison Summary

| Feature | PM2 | Systemd |
|---------|-----|---------|
| Crash recovery | ✓ (~410ms) | ✓ (~180ms) |
| Boot persistence | Via systemd unit | Native |
| Cluster mode | ✓ Built-in | ✗ |
| Memory overhead | ~83 MB | ~0 MB |
| Zero-downtime reload | ✓ | ✗ |
| Config as code | ✓ | Partial |
| Log management | Built-in files | journald |
| Resource limits (cgroups) | Basic | Full OS control |
| Cross-platform | ✓ | Linux only |
| Active development | ✓ | ✓ |
| Security sandboxing | ✗ | ✓ (PrivateTmp, etc.) |

## When to Use Systemd Alone

Systemd is the right choice when:

- You're running a **single-instance** app (no cluster mode needed)
- You want **maximum OS integration** — cgroups, namespaces, security sandboxing
- You're on a **resource-constrained server** where 83 MB for a PM2 daemon is meaningful
- You're comfortable with unit file syntax
- You want logs in **journald** alongside all other system logs

```ini
# A well-configured systemd unit covers most needs
[Service]
Type=simple
User=nodeapp
WorkingDirectory=/var/www/myapp
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production
EnvironmentFile=/var/www/myapp/.env

# Security
NoNewPrivileges=true
PrivateTmp=true

# Resource limits
MemoryMax=512M
CPUQuota=80%
LimitNOFILE=65536
```

## When to Use PM2

PM2 is the right choice when:

- You need **cluster mode** and don't want to write clustering code
- You want **zero-downtime rolling restarts** out of the box
- You need to work across **Linux, macOS, and Windows** with one config
- You want **`ecosystem.config.js`** committed alongside your app code
- Your team already knows PM2

## The Third Option: Oxmgr + Systemd

Here's the thing: PM2's two biggest advantages over systemd are cluster mode and zero-downtime deploys. Oxmgr has both — with 20× less memory overhead and 37× faster crash recovery than PM2. The [Oxmgr vs PM2 benchmark](/blog/oxmgr-vs-pm2-benchmark) has the full numbers with methodology.

The optimal production stack for most Node.js apps on Linux:

```
Systemd (boot + service lifecycle)
    └── Oxmgr (clustering + zero-downtime + health checks)
            ├── app:0 (Node.js worker)
            ├── app:1 (Node.js worker)
            ├── app:2 (Node.js worker)
            └── app:3 (Node.js worker)
```

Systemd handles what it's best at: ensuring Oxmgr starts at boot and restarts if it ever dies. Oxmgr handles what it's best at: application-level process management with cluster support, health checks, and rolling restarts.

**Systemd unit for Oxmgr:**

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=Oxmgr process manager for myapp
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=nodeapp
WorkingDirectory=/var/www/myapp
ExecStart=/usr/local/bin/oxmgr start --daemon
ExecStop=/usr/local/bin/oxmgr stop
ExecReload=/usr/local/bin/oxmgr reload
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Oxmgr config (version-controlled with your app):**

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
instances = 4
restart_on_exit = true
restart_delay_ms = 100
env = { NODE_ENV = "production" }

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 10
healthy_threshold = 2
```

Enable and start:

```bash
sudo systemctl enable myapp
sudo systemctl start myapp
```

Deploy with zero downtime:

```bash
git pull && npm run build && oxmgr reload
```

This combination gives you:
- ✓ Boot persistence (systemd)
- ✓ Cluster mode across all cores (Oxmgr)
- ✓ Zero-downtime rolling restarts (Oxmgr)
- ✓ Health check–gated deploys (Oxmgr)
- ✓ Config in your git repo (oxfile.toml)
- ✓ ~4 MB overhead instead of ~83 MB (Oxmgr vs PM2)
- ✓ 11ms crash recovery instead of 410ms (Oxmgr vs PM2)

## Migration from PM2 to Oxmgr

If you're currently running PM2 under systemd and want to switch:

```bash
# Stop PM2
pm2 stop all
pm2 delete all

# Remove PM2 startup script
pm2 unstartup systemd

# Install Oxmgr
npm install -g oxmgr

# If you have ecosystem.config.js, import it
oxmgr import ecosystem.config.js
# This generates an oxfile.toml — review it, then:

# Set up systemd unit (see above)
sudo systemctl enable myapp
sudo systemctl start myapp

# Verify
oxmgr status
```

Full migration guide in the [docs](/docs#pm2-migration).

## The Bottom Line

**PM2 vs systemd** is the wrong question. The real question is: *which combination of tools gives you the most reliability with the least overhead?*

- **Just systemd:** Great for simple single-process apps on Linux. Free, powerful, zero overhead.
- **PM2 alone:** Good ergonomics, works everywhere, but carries 83 MB of Node.js runtime as overhead.
- **PM2 + systemd:** What most people do. Works, but two layers of process management with duplicated concerns.
- **Oxmgr + systemd:** Best of both worlds. Systemd handles boot persistence, Oxmgr handles app-level management at a fraction of PM2's cost.

Install Oxmgr:

```bash
npm install -g oxmgr
```

Or see the [full comparison of all process managers](/blog/process-manager-comparison) for a wider view.
