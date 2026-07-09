---
title: Escaping Heroku — Move Your App to a $5 VPS Without Downtime
description: A step-by-step migration from Heroku to a self-hosted VPS — translating your Procfile, dynos, add-ons, and config vars into a process manager, a database, and a reverse proxy you control.
date: 2026-08-28
tags: [heroku, self-hosting, vps, migration, process-manager, devops]
keywords: [heroku alternative, migrate off heroku, heroku to vps, self host heroku app, procfile to process manager, replace heroku dynos, heroku cheaper alternative]
author: Oxmgr Team
---

# Escaping Heroku

Heroku made deployment feel like magic: `git push heroku main` and you were live. That magic now costs real money — the cheapest usable setup with a database and a worker runs well over $25/month, and it climbs fast. The good news is that everything Heroku gave you maps cleanly onto a VPS you fully control for a fraction of the price. Here's the migration.

## What Heroku actually gave you (and its VPS equivalent)

| Heroku concept | What it did | Self-hosted equivalent |
|---|---|---|
| Procfile | Declared your process types | An [`oxfile.toml`](/blog/oxfile-toml-complete-guide) |
| `web` dyno | Ran your web server | A supervised web process |
| `worker` dyno | Ran background jobs | A supervised [worker process](/blog/bullmq-workers-production) |
| Dyno restart | Kept processes alive | [Crash recovery](/blog/what-is-crash-recovery) |
| Config vars | Env-based config | An [env file](/blog/nodejs-environment-variables-production) |
| Postgres add-on | Managed database | [Postgres or SQLite](/blog/sqlite-in-production-small-apps) on the box |
| Router + TLS | HTTPS, routing | [Caddy / nginx](/blog/nodejs-vps-setup-nginx-ssl) |
| `git push heroku` | Build + deploy | A [git webhook](/blog/git-webhook-auto-deploy-nodejs) |

Every row on the right is something you already know how to do or can learn in an afternoon. There's no missing capability — just a few pieces you assemble yourself.

## Step 1: Translate your Procfile

A Heroku Procfile like:

```
web: node dist/server.js
worker: node dist/worker.js
release: node dist/migrate.js
```

becomes an `oxfile.toml`:

```toml
[processes.web]
command = "node dist/server.js"
restart_on_exit = true
[processes.web.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30

[processes.worker]
command = "node dist/worker.js"
restart_on_exit = true
```

The `release` phase (migrations) becomes a step in your [deploy script](/blog/how-to-deploy-nodejs-production), run before the reload — not a managed process.

## Step 2: Provision the box

A $5–10/month VPS (1–2 GB RAM) comfortably runs a small app plus Postgres. Basic hardening on day one:

```bash
adduser deploy && usermod -aG sudo deploy   # don't run as root
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable
```

Run your app as a [non-root user](/blog/run-nodejs-as-non-root) from the start. Install Node (or your runtime), your database, and [Oxmgr](/blog/introducing-oxmgr) (`npm i -g oxmgr`).

## Step 3: Move the database

This is the only genuinely careful step. For a small app:

1. Put your app in maintenance mode (or accept a short window).
2. `pg_dump` from Heroku Postgres, `pg_restore` into your VPS Postgres.
3. Update `DATABASE_URL` in your env file.

For zero-downtime you can set up logical replication, but for most apps migrating off Heroku, a few minutes of downtime at 3 a.m. is entirely acceptable and far simpler. Many small apps also discover they can run on [SQLite](/blog/sqlite-in-production-small-apps) once they're on a single box — no separate DB process at all.

## Step 4: Config vars → env file

Export your Heroku config and drop it into an env file:

```bash
heroku config -s --app your-app > .env.production
```

Load it via `env_file` in your process config, and keep it out of git. See [managing secrets properly](/blog/nodejs-environment-variables-production).

## Step 5: TLS + routing

Caddy gives you automatic HTTPS in three lines:

```
yourapp.com {
    reverse_proxy 127.0.0.1:3000
}
```

That replaces Heroku's router and SSL entirely. The [nginx + SSL guide](/blog/nodejs-vps-setup-nginx-ssl) covers the nginx path if you prefer it.

## Step 6: Reproduce `git push` deploys

You'll miss `git push heroku main`, so recreate it. A [git webhook auto-deploy](/blog/git-webhook-auto-deploy-nodejs) listens for pushes, pulls, builds, runs migrations, and `oxmgr reload web worker` for a [zero-downtime](/blog/zero-downtime-deployment) rollover. Now `git push origin main` deploys — same ergonomics, your infrastructure.

## Step 7: Replace the dashboard

Heroku's dashboard showed dyno status, logs, and restarts. You get the same three things: `oxmgr ls --json` for status ([scriptable](/blog/process-manager-json-jq-scripting)), per-process log files, and the [event bus](/blog/process-manager-event-bus) for real-time restarts and crashes — plus [Slack alerts](/blog/crash-alerts-slack-discord) that Heroku never gave you for free.

## The honest trade

You're trading **convenience for cost and control**. Heroku handles the box; you handle it now — reboots, upgrades, backups. But that's a few hours of setup and maybe an hour a month of maintenance, versus a bill that's often 5–10× a VPS. For a side project or a small SaaS, self-hosting is frequently the difference between "the hosting eats the revenue" and "the hosting is a rounding error." And unlike Heroku, nothing about a plain VPS + process manager stack will surprise you with a pricing change.

If Render or Railway (not Heroku) is your current platform, the same migration applies — see [Railway & Render are getting expensive](/blog/railway-render-alternative).
