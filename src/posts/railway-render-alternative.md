---
title: Railway and Render Are Getting Expensive — Here's the Self-Hosted Path
description: Railway and Render are great until the bill scales with usage. Here's an honest cost comparison and a migration path to a VPS you control — same deploy ergonomics, flat pricing.
date: 2026-08-31
tags: [railway, render, self-hosting, vps, cost, process-manager, devops]
keywords: [railway alternative, render alternative, railway too expensive, render pricing, self host instead of railway, migrate off render, paas alternative vps]
author: Oxmgr Team
---

# Railway and Render Are Getting Expensive

Railway and Render fixed everything people hated about Heroku's pricing model — until you scale, and discover the new model has its own cliff. Usage-based billing is wonderful when usage is low and alarming when it isn't. If your Railway or Render bill has started climbing faster than your app, here's the honest math and the way out.

## Where the cost comes from

These platforms bill on some mix of:

- **Compute time** — vCPU and RAM, metered by the minute/second.
- **Memory** — often the real driver; a memory-hungry app (looking at you, [JVM](/blog/spring-boot-production-deployment) and un-capped [Node](/blog/nodejs-memory-leaks-production)) costs more even at idle.
- **Egress bandwidth** — cheap until you serve real traffic or large assets.
- **Add-ons** — managed Postgres, Redis, cron, each metered separately.

The pattern: a hobby app is a few dollars, a real one with a database, a worker, and traffic is $40–100+/month. That same workload on a single VPS is $10–20 **flat**, regardless of how hard you use it. You're paying the platform for convenience and elasticity you may not need on one box.

## The cost comparison, honestly

| | Railway / Render | Self-hosted VPS |
|---|---|---|
| Small app + DB + worker | ~$25–60/mo, usage-scaled | ~$10–20/mo flat |
| Bandwidth | Metered | Usually generous/included |
| Scaling | Automatic (and auto-billed) | Manual (bigger box or more boxes) |
| Ops burden | ~None | A few hours setup, ~1 hr/mo |
| Surprise bills | Possible | No |

The trade is real: you take on ops in exchange for flat, predictable pricing. For many apps that's a great deal; for a team with no ops appetite, the platform is worth it. The point is to *choose* deliberately, not drift into a scaling bill.

## What you're replacing

Railway/Render give you: build-on-push, a process to run your app, managed databases, TLS, and a dashboard. All of it maps to a VPS stack:

| Platform feature | Self-hosted equivalent |
|---|---|
| Deploy on git push | [Git webhook auto-deploy](/blog/git-webhook-auto-deploy-nodejs) |
| Service that runs your app | A supervised process |
| Auto-restart | [Crash recovery](/blog/what-is-crash-recovery) |
| Managed Postgres | [Postgres / SQLite](/blog/sqlite-in-production-small-apps) on the box |
| Automatic HTTPS | [Caddy](/blog/nodejs-vps-setup-nginx-ssl) (also automatic) |
| Env vars UI | An [env file](/blog/nodejs-environment-variables-production) |
| Logs + metrics | Log files + [event bus](/blog/process-manager-event-bus) |

## The migration in one screen

Provision a VPS, harden it, and describe your services in one file. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.web]
command = "node dist/server.js"
restart_on_exit = true
[processes.web.env]
DATABASE_URL = "postgres://localhost/app"
[processes.web.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30

[processes.worker]
command = "node dist/worker.js"
restart_on_exit = true
```

`oxmgr start`, put Caddy in front, point DNS at the box, and wire a [git webhook](/blog/git-webhook-auto-deploy-nodejs) so pushes still deploy. That's the platform, reproduced. The full walkthrough — DB migration, secrets, deploy ergonomics — is in [Escaping Heroku](/blog/heroku-alternative-self-hosting); it applies verbatim to Railway and Render.

## Keep the ergonomics you liked

The reason to leave shouldn't be that self-hosting is worse to *use* — done right it isn't:

- **Push-to-deploy** — a webhook gives you the same `git push` → live flow.
- **Zero-downtime** — `oxmgr reload` does [health-gated rollovers](/blog/zero-downtime-deployment), same as the platform's rolling deploys.
- **Observability** — the [event bus](/blog/process-manager-event-bus) plus [Slack crash alerts](/blog/crash-alerts-slack-discord) actually beats the default dashboards, because you get the crash's stderr tail.
- **Rollback** — [instant rollback](/blog/instant-rollback-deployment) to the previous release in seconds.

## When to stay

Self-hosting isn't always right. Stay on Railway/Render if: your traffic is genuinely spiky and you need real autoscaling, you have zero ops bandwidth, or the bill is small enough that your time is better spent elsewhere. The calculation is simple — **compare a month of platform bill to a $15 VPS plus a few hours of your time.** Below some threshold the platform wins; above it, self-hosting pays for itself in the first month and keeps paying. The bigger you get, the more the flat VPS pricing wins — which is exactly backwards from how the platforms are priced.
