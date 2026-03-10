---
title: Oxfile.toml Complete Reference — Every Option Explained
description: The complete guide to oxfile.toml configuration. Every field, every option, with real examples for multi-process apps, health checks, resource limits, environment variables, and watch mode.
date: 2026-04-18
tags: [oxmgr, configuration, oxfile, toml, reference]
keywords: [oxfile.toml, oxmgr configuration, oxmgr config file, oxfile reference, oxmgr toml config, process manager config file, oxmgr setup, oxfile.toml examples]
author: Oxmgr Team
---

The `oxfile.toml` is the single source of truth for everything Oxmgr manages. No CLI flags to remember, no hidden state — your entire process configuration is in one file, version-controlled, reviewable in PRs.

This is the complete reference. Every field, every option, with working examples.

## File Location

Oxmgr looks for `oxfile.toml` in this order:

1. Path passed via `--config` flag: `oxmgr start --config /etc/myapp/oxfile.toml`
2. Current working directory: `./oxfile.toml`
3. User config dir: `~/.config/oxmgr/oxfile.toml`

Commit `oxfile.toml` to your repository root alongside `package.json`.

## Minimal Configuration

The smallest valid oxfile:

```toml
[processes.app]
command = "node server.js"
```

This starts `node server.js`, restarts it on crash, and uses sensible defaults for everything else.

## Process Configuration

Every process lives under `[processes.<name>]`. The name is how you reference it in CLI commands.

### `command` (required)

The shell command to run:

```toml
[processes.api]
command = "node dist/server.js"

[processes.worker]
command = "python -m celery worker -A tasks"

[processes.proxy]
command = "/usr/local/bin/caddy run --config /etc/caddy/Caddyfile"
```

The command runs in a shell (`/bin/sh -c`), so pipes and redirects work:

```toml
[processes.migrator]
command = "node migrate.js && echo 'done'"
```

### `working_dir`

Working directory for the process. Defaults to the directory containing `oxfile.toml`.

```toml
[processes.frontend]
command = "npm run preview"
working_dir = "/var/www/frontend"
```

### `instances`

Number of parallel instances to run. Useful for CPU-bound Node.js apps with cluster mode, or to run multiple identical workers:

```toml
[processes.api]
command = "node dist/server.js"
instances = 4   # Run 4 parallel instances
```

When `instances > 1`, Oxmgr passes the instance index via `OXMGR_INSTANCE_ID` (0-indexed). Use it to assign unique ports if your app doesn't share a port via a load balancer:

```toml
[processes.api]
command = "node dist/server.js"
instances = 4
env = { PORT = "3000" }  # BASE port — OXMGR_INSTANCE_ID offsets it
```

```javascript
// In your server.js
const port = parseInt(process.env.PORT) + parseInt(process.env.OXMGR_INSTANCE_ID || '0');
server.listen(port);
```

### `restart_on_exit`

Restart the process when it exits, regardless of exit code:

```toml
[processes.api]
command = "node server.js"
restart_on_exit = true   # default: false
```

Set to `false` for one-shot processes (migrations, jobs):

```toml
[processes.migrate]
command = "node migrate.js"
restart_on_exit = false
```

### `restart_delay_ms`

Milliseconds to wait before restarting after a crash. Prevents tight restart loops:

```toml
[processes.api]
command = "node server.js"
restart_on_exit = true
restart_delay_ms = 1000   # wait 1 second before restarting
```

Use exponential backoff for flaky services by increasing this value:

```toml
[processes.flaky-integration]
command = "node integration.js"
restart_on_exit = true
restart_delay_ms = 5000   # wait 5 seconds — gives external service time to recover
```

### `max_restarts`

Stop restarting after N consecutive crashes. Prevents infinite crash loops that consume system resources:

```toml
[processes.api]
command = "node server.js"
restart_on_exit = true
max_restarts = 10   # give up after 10 crashes, leave the process stopped
```

When `max_restarts` is reached, `oxmgr status` shows the process as `crashed` and requires manual intervention (`oxmgr restart api`).

Set to `0` for unlimited restarts (use with caution):

```toml
restart_on_exit = true
max_restarts = 0   # never give up — useful if the app must always run
```

### `stop_signal`

Signal sent to the process when stopping or reloading. Default is `SIGTERM`:

```toml
[processes.api]
command = "node server.js"
stop_signal = "SIGTERM"   # default — use for graceful shutdown
```

Use `SIGINT` if your app handles `Ctrl+C` but not `SIGTERM`:

```toml
stop_signal = "SIGINT"
```

### `stop_timeout_ms`

How long to wait for graceful shutdown before force-killing with `SIGKILL`. Default: 10000 (10 seconds):

```toml
[processes.api]
command = "node server.js"
stop_timeout_ms = 30000   # wait up to 30s for graceful shutdown
```

If your app has long-running requests (file uploads, streaming), increase this:

```toml
stop_timeout_ms = 60000   # 60 seconds for long-running requests
```

## Environment Variables

### `env` — Inline Variables

```toml
[processes.api]
command = "node server.js"
env = { NODE_ENV = "production", PORT = "3000", LOG_LEVEL = "info" }
```

For many variables, use multi-line TOML syntax:

```toml
[processes.api.env]
NODE_ENV = "production"
PORT = "3000"
LOG_LEVEL = "info"
DATABASE_URL = "postgresql://user:pass@localhost/mydb"
REDIS_URL = "redis://localhost:6379"
JWT_SECRET = "your-secret-here"
```

### `env_file` — Load from File

Load variables from a `.env` file:

```toml
[processes.api]
command = "node server.js"
env_file = ".env.production"
```

Variables in `env` take precedence over `env_file` if both are set. Use this pattern for secrets: keep secrets in `.env.production` (not committed), and non-secrets in `env`:

```toml
[processes.api]
command = "node server.js"
env_file = ".env.production"   # contains DATABASE_URL, JWT_SECRET, etc.

[processes.api.env]
NODE_ENV = "production"        # safe to commit
PORT = "3000"
```

## Health Checks

Health checks determine if a process is healthy. Oxmgr polls the endpoint; if it returns non-200, the process is marked unhealthy and restarted.

```toml
[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30          # check every 30 seconds
timeout_secs = 5            # fail if no response within 5 seconds
healthy_threshold = 1       # passes after 1 successful check
unhealthy_threshold = 3     # fails after 3 consecutive failures
initial_delay_secs = 10     # wait 10s after start before first check
```

**`initial_delay_secs`** is critical for slow-starting apps. Without it, Oxmgr may restart a perfectly healthy app that just hasn't finished initializing.

For apps with database migrations or heavy startup:

```toml
[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 10
initial_delay_secs = 60   # app takes up to 60s to be ready
unhealthy_threshold = 5
```

Health checks on `oxmgr reload` (rolling restart): Oxmgr waits for the new instance to pass `healthy_threshold` consecutive checks before stopping the old instance. This is what makes zero-downtime deploys work.

## File Watching

Automatically restart the process when files change. Designed for development, but useful in production for interpreted languages:

```toml
[processes.api]
command = "node server.js"
watch = ["src", "config"]   # watch these directories

watch_extensions = [".js", ".ts", ".json"]   # only restart for these file types
watch_ignore = ["node_modules", "*.log"]      # ignore these patterns
```

Disable watch in production by not setting `watch`. Or use separate config files per environment:

```bash
# Development
oxmgr start --config oxfile.dev.toml

# Production
oxmgr start --config oxfile.toml
```

## Resource Limits

Cap CPU and memory per process. When limits are exceeded, Oxmgr sends `stop_signal` and restarts:

```toml
[processes.api.limits]
memory_mb = 512      # restart if RSS exceeds 512 MB
cpu_percent = 80     # restart if CPU >80% for the sustained period
cpu_window_secs = 60 # measure CPU over 60-second windows
```

Useful for containing memory leaks — set a generous limit above normal usage, and the process restarts when it hits the ceiling rather than crashing the whole server.

```toml
[processes.worker.limits]
memory_mb = 256   # worker normally uses 64MB, 256MB means "something is wrong"
```

## Log Configuration

```toml
[processes.api]
command = "node server.js"
log_file = "/var/log/api/out.log"
error_log_file = "/var/log/api/error.log"
log_date_format = "YYYY-MM-DD HH:mm:ss"
```

Disable log files to let systemd/journald capture output:

```toml
[processes.api]
command = "node server.js"
# No log_file — stdout/stderr go to the terminal or journald
```

Log rotation — Oxmgr rotates log files automatically:

```toml
[processes.api.logs]
max_size_mb = 100    # rotate when log file reaches 100 MB
max_files = 5        # keep 5 rotated files
compress = true      # compress old files with gzip
```

## Git Webhooks

Auto-deploy when a branch is pushed to. Oxmgr starts a webhook server that listens for GitHub/GitLab push events:

```toml
[processes.api.webhook]
enabled = true
port = 9000
secret = "your-webhook-secret"   # must match GitHub webhook secret
branch = "main"                   # only deploy on pushes to main

# Commands to run on deploy
on_push = [
  "git pull origin main",
  "npm ci",
  "npm run build",
  "oxmgr reload api"
]
```

In GitHub: Settings → Webhooks → Add webhook:
- Payload URL: `http://your-server.com:9000`
- Content type: `application/json`
- Secret: same as `secret` above
- Events: `Just the push event`

## Complete Example: Multi-Service App

A realistic oxfile for a web app with API, background worker, and scheduled job:

```toml
# oxfile.toml

[processes.api]
command = "node dist/api/server.js"
instances = 2
restart_on_exit = true
restart_delay_ms = 1000
max_restarts = 20
stop_timeout_ms = 30000
env_file = ".env.production"

[processes.api.env]
NODE_ENV = "production"
PORT = "3000"
LOG_LEVEL = "info"

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30
initial_delay_secs = 15
unhealthy_threshold = 3
healthy_threshold = 2

[processes.api.limits]
memory_mb = 1024

[processes.api.logs]
max_size_mb = 200
max_files = 7
compress = true


[processes.worker]
command = "node dist/worker/index.js"
instances = 1
restart_on_exit = true
restart_delay_ms = 2000
max_restarts = 10
env_file = ".env.production"

[processes.worker.env]
NODE_ENV = "production"
WORKER_CONCURRENCY = "5"

[processes.worker.limits]
memory_mb = 512


[processes.scheduler]
command = "node dist/scheduler.js"
instances = 1
restart_on_exit = true
max_restarts = 5

[processes.scheduler.env]
NODE_ENV = "production"


[processes.migrate]
command = "node dist/migrate.js"
restart_on_exit = false   # run once, don't restart
```

Start everything:

```bash
oxmgr start
```

Start only the API:

```bash
oxmgr start api
```

Deploy with zero downtime:

```bash
npm run build && oxmgr reload api
```

## CLI Command Reference

All commands accept an optional process name. Without a name, they apply to all processes.

```bash
oxmgr start              # start all processes
oxmgr start api          # start only 'api'
oxmgr stop               # stop all
oxmgr stop worker        # stop only 'worker'
oxmgr restart api        # hard restart (gaps between stop and start)
oxmgr reload api         # rolling restart — zero downtime
oxmgr status             # show all process status
oxmgr status --json      # machine-readable JSON output
oxmgr logs api           # tail logs for 'api'
oxmgr logs api -n 200    # last 200 lines
oxmgr import ecosystem.config.js   # migrate from PM2
```

## Validating Your Config

Before deploying, validate syntax:

```bash
oxmgr validate
# ✓ oxfile.toml is valid
# 3 processes defined: api, worker, scheduler
```

Dry-run to see what would happen:

```bash
oxmgr start --dry-run
# Would start: api (×2 instances), worker, scheduler
```

Full documentation at [oxmgr.empellio.com/docs](/docs).
