---
title: Migrating from PM2 to Oxmgr — A Step-by-Step Guide
description: A practical migration path from PM2 to Oxmgr — import your ecosystem.config.js, map every PM2 field to its oxfile.toml equivalent, keep zero-downtime reloads, and roll back safely if you need to.
date: 2026-07-26
tags: [pm2, oxmgr, migration, node.js, process-manager, devops]
keywords: [migrate from pm2, pm2 to oxmgr, ecosystem.config.js import, pm2 alternative migration, replace pm2, pm2 oxfile.toml, pm2 migration guide]
author: Oxmgr Team
---

# Migrating from PM2 to Oxmgr

PM2 works. If it's keeping your app alive today, there's no emergency. But if you're tired of it eating [80 MB of RAM before your app starts](/blog/introducing-oxmgr), of `pm2 update` ceremony after every Node upgrade, or of process state that lives in `~/.pm2` instead of your repo, migrating is straightforward — and reversible. This is the whole path.

## Step 0: Understand what changes

The mental model shift is small but real:

| | PM2 | Oxmgr |
|---|---|---|
| Config | `ecosystem.config.js` + CLI flags | `oxfile.toml`, committed to git |
| Runtime | Node.js daemon (~83 MB) | Single Rust binary (~4 MB) |
| State | `~/.pm2/dump.pm2` | The config file is the state |
| Reload | `pm2 reload` | `oxmgr reload` |

The biggest practical difference: Oxmgr treats your config file as the source of truth, so there's no hidden `pm2 save` state to keep in sync. What's in `oxfile.toml` is what runs.

## Step 1: Import your ecosystem file

Oxmgr reads PM2 ecosystem files directly, and can convert one to an oxfile:

```bash
oxmgr import ecosystem.config.js
```

This generates an equivalent `oxfile.toml` for you to review. It maps the fields you actually use — `name`, `script`, `args`, `instances`, `exec_mode`, `env`, `cwd`, `max_restarts`, and (new in [0.5.0](/blog/oxmgr-v0-5-0-release)) the log paths `out_file`, `error_file`, and `log_file`.

You can also just point Oxmgr at the ecosystem file and run it as-is while you migrate:

```bash
oxmgr start ecosystem.config.js
```

That's handy for a side-by-side comparison before you commit to the TOML.

## Step 2: Map the fields you care about

Here's a typical PM2 config and its oxfile equivalent.

**Before — `ecosystem.config.js`:**

```js
module.exports = {
  apps: [{
    name: 'api',
    script: 'dist/server.js',
    instances: 4,
    exec_mode: 'cluster',
    max_restarts: 10,
    env: { NODE_ENV: 'production', PORT: '3000' },
    out_file: '/var/log/api.out.log',
    error_file: '/var/log/api.err.log',
  }, {
    name: 'worker',
    script: 'dist/worker.js',
    max_memory_restart: '500M',
  }]
};
```

**After — `oxfile.toml`:**

```toml
[processes.api]
command = "node dist/server.js"
instances = 4
cluster_mode = true
max_restarts = 10

[processes.api.env]
NODE_ENV = "production"
PORT = "3000"

[processes.api.logs]
stdout = "/var/log/api.out.log"
stderr = "/var/log/api.err.log"

[processes.worker]
command = "node dist/worker.js"

[processes.worker.limits]
memory = "500M"      # restart if it exceeds this
```

A few mappings worth memorizing:

- `exec_mode: 'cluster'` → `cluster_mode = true`
- `max_memory_restart` → `[processes.<name>.limits].memory` (see [resource limits](/blog/nodejs-resource-limits-production))
- `env_production` / `--env` juggling → a plain `env` table, or `env_file`
- `cron_restart` → a [scheduled restart](/blog/scheduled-rolling-restarts)

The full field list is in the [oxfile.toml reference](/blog/oxfile-toml-complete-guide).

## Step 3: Add a health check (PM2 didn't make this easy)

Migration is a good moment to add what PM2 made awkward — a real [readiness health check](/blog/nodejs-health-checks) that gates reloads:

```toml
[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30
```

Now `oxmgr reload` waits for the new instance to report healthy before draining the old one — [zero-downtime reloads](/blog/zero-downtime-deployment) that are readiness-aware, not just timer-based.

## Step 4: Cut over, keeping PM2 as the safety net

You don't have to flip everything at once.

```bash
# 1. Validate the generated config
oxmgr validate oxfile.toml

# 2. Stop PM2 for one app, start it under Oxmgr
pm2 delete api
oxmgr start          # brings up api from oxfile.toml

# 3. Watch it
oxmgr events --process api
oxmgr ls --json | jq '.[] | select(.name=="api")'
```

Do one process at a time. PM2 keeps managing the rest until you're satisfied. If something's wrong, `oxmgr delete api && pm2 start ecosystem.config.js --only api` puts it back.

## Step 5: Make it survive reboots

Replace `pm2 startup` + `pm2 save` with Oxmgr's [boot integration](/blog/run-nodejs-on-server-startup):

```bash
oxmgr startup
```

This registers the Oxmgr daemon as a systemd/launchd unit so your processes come back after a reboot — driven by `oxfile.toml`, not a saved dump.

## Step 6: Uninstall PM2

Once every app runs under Oxmgr and survives a test reboot:

```bash
pm2 kill
npm remove -g pm2
rm -rf ~/.pm2
```

## What you gain

Beyond the [memory and startup numbers](/blog/oxmgr-vs-pm2-benchmark), the day-to-day wins are: config in git and reviewed in PRs, a [real-time event bus](/blog/process-manager-event-bus) instead of `pm2 logs` scraping, and no Node dependency for your process manager. If you were only using PM2 because it was the default, this is a clean upgrade. If you're on the fence, keep both running side by side for a week — the reversible cutover is the point.
