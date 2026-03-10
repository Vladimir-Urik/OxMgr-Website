---
title: Linux Process Management Guide — Signals, Daemons, Systemd, and Process Managers
description: A complete guide to Linux process management. Covers process lifecycle, signals, daemons, systemd units, cgroups, and how modern process managers like PM2 and Oxmgr fit into the picture.
date: 2026-03-12
tags: [linux, process-management, systemd, devops, tutorial]
keywords: [linux process management, linux process manager, linux daemon, systemd process management, linux signals, linux process lifecycle, background process linux, linux production deployment, process management guide linux]
author: Oxmgr Team
---

# Linux Process Management Guide

Running applications reliably on Linux means understanding how the OS thinks about processes — not just which commands to run. This guide covers the fundamentals: what processes are, how they live and die, how the OS controls them, and how modern process managers fit into that picture.

## What Is a Process?

From Linux's perspective, a process is a running instance of a program. It has:

- A **PID** (Process ID) — unique integer, assigned by the kernel
- A **PPID** (Parent PID) — the process that created it
- An **owner** — user and group that control access
- **File descriptors** — open files, sockets, pipes
- **Memory maps** — stack, heap, code segments
- An **exit status** — 0 for success, non-zero for error

You can see all processes with:

```bash
ps aux
# or more readable:
ps -eo pid,ppid,user,stat,comm --sort=pid | head -30
```

## The Process Lifecycle

Every Linux process goes through the same lifecycle:

```
Created (fork/exec)
    ↓
Running (RUNNING or SLEEPING)
    ↓
Stopped (SIGSTOP) ← optional
    ↓
Zombie (waiting for parent to read exit status)
    ↓
Dead (removed from process table)
```

**Running** — actively executing or waiting for I/O
**Sleeping** (S) — waiting for an event (I/O, timer, lock)
**Zombie** (Z) — process has exited but parent hasn't called `wait()` yet
**Stopped** (T) — process is paused via SIGSTOP

The zombie state matters for process managers. When a managed process dies, the manager must call `wait()` to reap the zombie and free the PID. A leaky process manager that doesn't reap children will accumulate zombie processes.

## Process Signals

Signals are the OS's mechanism for communicating with running processes. You've likely used `kill` — but `kill` sends any signal, not just termination.

| Signal | Number | Default Action | Meaning |
|--------|--------|---------------|---------|
| SIGHUP | 1 | Terminate | Terminal hangup / reload config |
| SIGINT | 2 | Terminate | Keyboard interrupt (Ctrl+C) |
| SIGQUIT | 3 | Core dump | Keyboard quit (Ctrl+\\) |
| SIGKILL | 9 | Terminate | Forceful kill (cannot be caught) |
| SIGTERM | 15 | Terminate | Graceful termination request |
| SIGSTOP | 19 | Stop | Pause process (cannot be caught) |
| SIGCONT | 18 | Continue | Resume stopped process |
| SIGUSR1 | 10 | Terminate | User-defined signal 1 |
| SIGUSR2 | 12 | Terminate | User-defined signal 2 |

### SIGTERM vs SIGKILL

The most important distinction for production:

**SIGTERM (15)** — a polite request to shut down. The process can catch this signal, finish in-flight requests, flush buffers, close connections, and exit cleanly. This is what `kill <pid>` sends by default.

**SIGKILL (9)** — unconditional termination. The kernel kills the process immediately. No cleanup, no graceful shutdown, no chance to respond. This is what `kill -9 <pid>` sends.

Always try SIGTERM first and give the process time to respond. SIGKILL is the last resort.

In Node.js, handle SIGTERM for graceful shutdown:

```javascript
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  // Stop accepting new connections
  server.close(async () => {
    // Finish in-flight requests, close DB connections
    await db.close();
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});
```

### SIGHUP for Config Reloads

By convention, SIGHUP (`kill -HUP <pid>`) tells a daemon to reload its configuration without restarting. Nginx, Apache, and many other servers respect this convention.

```bash
# Reload nginx config without downtime
kill -HUP $(cat /var/run/nginx.pid)
# Or:
nginx -s reload
```

Process managers use this internally during zero-downtime deploys.

## Daemons

A **daemon** is a process that runs in the background, detached from any terminal. The word comes from Unix mythology — a daemon is a background helper spirit.

To daemonize a process, it must:

1. **Fork** from its parent
2. **Create a new session** (`setsid`) to detach from the controlling terminal
3. **Fork again** to ensure it can't reacquire a terminal
4. **Close standard file descriptors** (stdin, stdout, stderr)
5. **Change working directory** to `/` (so it doesn't hold a mount point busy)
6. **Write a PID file** so other processes can find it

This is complex. In practice, you don't write this code yourself — you let systemd or a process manager handle it.

## Systemd: The Modern Way

Systemd is the init system (PID 1) on every major Linux distribution since ~2015. It starts all system daemons at boot and manages them throughout the system's lifetime.

### Unit Files

Systemd manages services via unit files — declarative configs that describe how to run a process:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node.js Application
Documentation=https://myapp.com/docs
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nodeapp
Group=nodeapp
WorkingDirectory=/var/www/myapp
ExecStart=/usr/bin/node dist/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

# Environment
Environment=NODE_ENV=production
EnvironmentFile=-/var/www/myapp/.env

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/www/myapp/logs

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

```bash
# Install and enable
sudo systemctl daemon-reload
sudo systemctl enable myapp
sudo systemctl start myapp

# Check status
sudo systemctl status myapp

# View logs (real-time)
journalctl -u myapp -f

# View last 100 lines
journalctl -u myapp -n 100
```

### Restart Policies

Systemd's `Restart=` key controls when to restart a service:

| Value | Restarts when... |
|-------|-----------------|
| `no` | Never |
| `on-success` | Exit code 0 |
| `on-failure` | Non-zero exit, signal, timeout |
| `on-abnormal` | Signal, timeout, watchdog |
| `always` | Any exit, including clean |

For production apps, use `Restart=on-failure` or `Restart=always`.

### cgroups: Resource Control

Systemd places each service in a **cgroup** (control group), which allows the kernel to enforce resource limits:

```ini
[Service]
MemoryMax=512M
MemorySwapMax=0
CPUQuota=50%
TasksMax=100
```

This prevents a runaway process from consuming all available memory and crashing the entire system. Systemd's integration with cgroups is one of its biggest advantages over standalone process managers.

## Process Managers vs Systemd

You might wonder: if systemd is already there, why use a separate process manager?

| Need | Systemd | Process Manager |
|------|---------|----------------|
| Boot persistence | Native | Via systemd unit |
| Crash recovery | ✓ | ✓ |
| Cluster mode | ✗ | ✓ |
| Config portability | ✗ (Linux-only) | ✓ (cross-platform) |
| Log management | Via journald | Built-in |
| Zero-downtime deploy | Complex | ✓ |
| Developer ergonomics | Low | High |

**The best production setup often combines both:** systemd starts and manages the process manager as a system service, and the process manager handles application-level concerns like clustering, health checks, and rolling restarts.

```ini
# systemd unit for Oxmgr
[Service]
Type=forking
User=nodeapp
WorkingDirectory=/var/www/myapp
ExecStart=/usr/local/bin/oxmgr start --daemon
ExecStop=/usr/local/bin/oxmgr stop
ExecReload=/usr/local/bin/oxmgr reload
Restart=on-failure
```

Then Oxmgr handles the application-level complexity:

```toml
# oxfile.toml — version-controlled, cross-platform
[processes.api]
command = "node dist/server.js"
instances = 4
restart_on_exit = true

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 15
```

## Practical Commands Reference

### Process Inspection

```bash
# List all processes (sorted by CPU)
ps aux --sort=-%cpu | head -20

# Process tree
pstree -p

# Real-time process monitor
top
htop   # better, install with: apt install htop

# Find processes by name
pgrep -l node
pgrep -a node

# Process file descriptors
lsof -p <pid>

# Process memory maps
cat /proc/<pid>/maps

# Full process status
cat /proc/<pid>/status
```

### Signal Sending

```bash
# Graceful shutdown
kill <pid>           # sends SIGTERM

# Force kill
kill -9 <pid>        # sends SIGKILL

# Reload config
kill -HUP <pid>      # sends SIGHUP

# Kill by name
pkill node
pkill -9 node

# Kill all processes of a user
pkill -u nodeapp
```

### Systemd Management

```bash
# Service control
systemctl start myapp
systemctl stop myapp
systemctl restart myapp
systemctl reload myapp    # SIGHUP

# Status and logs
systemctl status myapp
journalctl -u myapp -f         # follow logs
journalctl -u myapp --since "1 hour ago"
journalctl -u myapp -n 100 --no-pager

# Boot management
systemctl enable myapp
systemctl disable myapp
systemctl is-enabled myapp

# List all services
systemctl list-units --type=service
```

## Common Production Patterns

### Graceful Shutdown Under Load

The proper shutdown sequence for a Node.js server:

1. Receive SIGTERM
2. Stop accepting new connections
3. Wait for in-flight requests to complete (with timeout)
4. Close database connections
5. Exit with code 0

```javascript
let server;
let isShuttingDown = false;

server = app.listen(3000);

process.on('SIGTERM', () => {
  isShuttingDown = true;

  server.close(() => {
    // All connections closed
    pool.end(() => process.exit(0));
  });

  // Reject new requests during shutdown
  app.use((req, res) => {
    res.setHeader('Connection', 'close');
    res.status(503).json({ error: 'Server shutting down' });
  });
});
```

### Process Limits

Increase file descriptor limits for high-traffic apps:

```bash
# Check current limits
ulimit -n

# Increase for current session
ulimit -n 65536

# Permanent — add to /etc/security/limits.conf
nodeapp soft nofile 65536
nodeapp hard nofile 65536
```

Via systemd:

```ini
[Service]
LimitNOFILE=65536
```

## Summary

Linux process management has multiple layers:

1. **OS layer** — the kernel manages PIDs, signals, cgroups
2. **Init layer** — systemd manages boot-time service startup and system-level lifecycle
3. **Application layer** — process managers (PM2, Oxmgr) handle app-level concerns: clustering, health checks, developer-friendly config, cross-platform portability

For most Node.js production deployments, the recommended stack is:

```
systemd → Oxmgr → [app:0, app:1, app:2, app:3]
```

Systemd ensures Oxmgr survives reboots. Oxmgr handles everything your application needs: crash recovery, rolling deploys, health checks, and log management.

See the [Oxmgr documentation](/docs) to get started, or the [deployment guide](/blog/how-to-deploy-nodejs-production) for a step-by-step walkthrough.
