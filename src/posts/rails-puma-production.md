---
title: Deploying Ruby on Rails in Production — Puma, Workers, and Restarts
description: A practical guide to running Rails in production — Puma workers vs threads, phased restarts for zero downtime, Sidekiq jobs, and keeping it all alive with a process manager instead of Capistrano rituals.
date: 2026-08-10
tags: [ruby-on-rails, puma, sidekiq, production, process-manager, devops]
keywords: [rails puma production, deploy rails without heroku, puma workers threads, rails process manager, sidekiq production, rails zero downtime restart, puma phased restart]
author: Oxmgr Team
---

# Deploying Ruby on Rails in Production

Rails deployment used to mean Capistrano, a pile of shell tasks, and a lot of tribal knowledge. You don't need any of that to run Rails well on a VPS. You need Puma configured correctly, a supervisor to keep it and your job workers alive, and a reverse proxy in front. Here's the whole picture.

## Puma: workers vs threads

Puma has two concurrency dials, and getting them right is most of the battle:

- **Workers** are separate processes (forked), each with its own memory. They give you true parallelism across CPU cores and isolation — one worker crashing doesn't take the others down.
- **Threads** run inside a worker. Because of the GVL, threads help most when your requests spend time waiting on IO (database, HTTP calls), which is most Rails apps.

A sane starting point on a 4-core box:

```ruby
# config/puma.rb
workers Integer(ENV.fetch('WEB_CONCURRENCY', 4))
threads_count = Integer(ENV.fetch('RAILS_MAX_THREADS', 5))
threads threads_count, threads_count

preload_app!

port ENV.fetch('PORT', 3000)
environment ENV.fetch('RAILS_ENV', 'production')

on_worker_boot do
  ActiveRecord::Base.establish_connection
end
```

Rule of thumb: `workers` ≈ CPU cores, `threads` = 5, and make sure your DB pool (`RAILS_MAX_THREADS`) is at least `threads` per worker. This is the same [core-utilization problem Node solves with clustering](/blog/nodejs-clustering-multi-core) — Puma just bakes it in.

## Keep it alive with a process manager

Puma running in a terminal is a demo, not a deployment. You want something that restarts it on crash, brings it back after a reboot, caps its memory, and manages logs. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.web]
command = "bundle exec puma -C config/puma.rb"
working_dir = "/srv/myapp"
restart_on_exit = true

[processes.web.env]
RAILS_ENV = "production"
WEB_CONCURRENCY = "4"
RAILS_MAX_THREADS = "5"
PORT = "3000"

[processes.web.health_check]
endpoint = "http://localhost:3000/up"
interval_secs = 30
```

Rails 7.1+ ships a `/up` health endpoint out of the box — perfect for a [readiness health check](/blog/nodejs-health-checks) that gates reloads.

## Sidekiq for background jobs

Almost every real Rails app has background work. Run Sidekiq as its own supervised process:

```toml
[processes.jobs]
command = "bundle exec sidekiq -c 10"
working_dir = "/srv/myapp"
restart_on_exit = true

[processes.jobs.env]
RAILS_ENV = "production"
```

The concurrency and stuck-job concerns here are the same as any queue worker — the [BullMQ workers guide](/blog/bullmq-workers-production) covers the patterns (concurrency sizing, graceful drain, avoiding poisoned jobs) in a way that maps directly onto Sidekiq.

## Zero-downtime restarts

Puma has a built-in **phased restart** that reloads workers one at a time, keeping the app serving throughout:

```bash
bundle exec pumactl phased-restart
```

For a deploy, the sequence is: pull code, `bundle install`, `rails assets:precompile`, run migrations, then phased-restart. You can drive that from a [git webhook](/blog/git-webhook-auto-deploy-nodejs) so a push to `main` deploys automatically. If a deploy goes wrong, [instant rollback](/blog/instant-rollback-deployment) is checkout-previous-release plus another phased restart.

For a full stop-start rollover, `oxmgr reload web` gives you a [readiness-gated zero-downtime restart](/blog/zero-downtime-deployment) at the process-manager level — useful when the change is big enough that you want fresh workers, not phased ones.

## The reverse proxy

Put nginx or Caddy in front of Puma for TLS, static assets, and buffering. Rails is particularly sensitive to slow clients, so a buffering proxy matters. The [nginx + SSL VPS setup](/blog/nodejs-vps-setup-nginx-ssl) applies almost verbatim — point the upstream at `localhost:3000` and let Rails serve `X-Accel`-style redirects for large files. For a comparison of Caddy vs nginx vs Traefik in this role, see the [reverse proxy comparison](/blog/reverse-proxy-process-manager-comparison).

## Memory: the Rails reality

Rails workers grow. Copy-on-write from `preload_app!` helps at boot, but over hours each worker's RSS climbs. Two defenses:

1. **A memory cap that restarts the worker** — via [resource limits](/blog/nodejs-resource-limits-production), so a bloated worker recycles before it triggers the [OOM killer](/blog/linux-oom-killer-nodejs).
2. **`jemalloc`** — `LD_PRELOAD` jemalloc (or build Ruby with it) noticeably reduces fragmentation and steady-state memory for most Rails apps.

## The whole stack in one file

```toml
[processes.web]
command = "bundle exec puma -C config/puma.rb"
restart_on_exit = true
[processes.web.limits]
memory = "600M"
[processes.web.health_check]
endpoint = "http://localhost:3000/up"
interval_secs = 30

[processes.jobs]
command = "bundle exec sidekiq -c 10"
restart_on_exit = true
[processes.jobs.limits]
memory = "800M"
```

`oxmgr start`, put Caddy in front, point DNS at the box. That's a production Rails deployment — no Capistrano, no Heroku, no Kubernetes. If you're currently paying platform prices for this, the [escaping Heroku guide](/blog/heroku-alternative-self-hosting) walks through the migration.
