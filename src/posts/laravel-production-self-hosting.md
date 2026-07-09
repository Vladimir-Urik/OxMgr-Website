---
title: Running Laravel in Production Without Forge — php-fpm, Queues, and Horizon
description: How to self-host Laravel on a plain VPS — php-fpm tuning, queue workers, the scheduler, and Horizon — all supervised by a process manager instead of paying for Forge or Vapor.
date: 2026-08-13
tags: [laravel, php, php-fpm, horizon, production, process-manager, devops]
keywords: [laravel production self host, laravel without forge, php-fpm production, laravel queue worker supervisor, laravel horizon production, laravel scheduler cron, deploy laravel vps]
author: Oxmgr Team
---

# Running Laravel in Production Without Forge

Laravel Forge and Vapor are convenient, and they charge for that convenience. If you're comfortable on a VPS, self-hosting Laravel is not hard — it's four moving parts (php-fpm, queue workers, the scheduler, and optionally Horizon) plus a reverse proxy. The trick is supervising the parts that aren't php-fpm, because those are where DIY Laravel usually falls over.

## The architecture

Unlike a Node app, Laravel's web tier isn't a long-running process you supervise — it's **php-fpm**, a pool of PHP workers that nginx talks to over FastCGI. What you *do* need to keep alive as long-running processes:

- **Queue workers** (`php artisan queue:work`) — these die, leak, and need restarting on deploy.
- **The scheduler** (`php artisan schedule:run`, every minute) — Laravel's cron.
- **Horizon**, if you use Redis queues — a supervisor for queue workers with a dashboard.

```
nginx ──FastCGI──▶ php-fpm (web)
  │
  └── static files

process manager ──▶ queue:work
                └──▶ schedule (every 60s)
                └──▶ horizon (optional)
```

## php-fpm: tune the pool

php-fpm's defaults are conservative. Tune the pool to your box in `/etc/php/8.3/fpm/pool.d/www.conf`:

```ini
pm = dynamic
pm.max_children = 20        ; (RAM for PHP) / (avg worker MB). Measure, don't guess.
pm.start_servers = 4
pm.min_spare_servers = 2
pm.max_spare_servers = 6
pm.max_requests = 500       ; recycle workers to bound memory growth
```

`pm.max_children` is the one that matters: too low and requests queue; too high and you OOM. Measure a worker's real RSS under load and divide your PHP memory budget by it. php-fpm is managed by systemd on most distros — leave that as is; it's the *other* processes that need your attention.

## Supervise the workers

The classic Laravel-on-a-VPS pain is queue workers that silently die and jobs that pile up. A process manager fixes exactly this. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.queue]
command = "php artisan queue:work --tries=3 --max-time=3600 --sleep=1"
working_dir = "/srv/laravel"
instances = 3
restart_on_exit = true

[processes.scheduler]
command = "php artisan schedule:work"
working_dir = "/srv/laravel"
restart_on_exit = true
```

Notes that save you pain:

- **`--max-time=3600`** recycles each worker hourly so a slow memory leak never becomes an [OOM kill](/blog/linux-oom-killer-nodejs). This is the queue-worker equivalent of php-fpm's `pm.max_requests`.
- **`schedule:work`** (Laravel 8+) runs the scheduler as a long-lived process, so you don't need a real crontab line — the process manager keeps it alive. If you prefer cron, the [cron vs process managers](/blog/cron-jobs-vs-process-managers) post covers when each is right.
- **`instances = 3`** runs three parallel workers; scale to your throughput. The general queue-worker concerns (concurrency, stuck jobs, graceful drain) are covered in the [BullMQ workers guide](/blog/bullmq-workers-production) and translate directly.

## Horizon instead, if you're on Redis

If you use Redis queues, Horizon is the nicer option — it auto-balances workers and gives you a dashboard. Run *Horizon itself* under the process manager (it supervises workers; something must supervise it):

```toml
[processes.horizon]
command = "php artisan horizon"
working_dir = "/srv/laravel"
restart_on_exit = true
stop_signal = "SIGTERM"
stop_timeout_ms = 30000
```

The generous `stop_timeout_ms` gives Horizon time to finish in-flight jobs before it's killed — a [graceful shutdown](/blog/nodejs-graceful-shutdown-complete-guide) so you don't drop work on deploy.

## Deploys and the restart nobody remembers

Laravel workers run *old code until restarted*. This is the #1 self-hosted Laravel bug: you deploy, but the queue keeps running the previous release. Your deploy script must end with a restart:

```bash
git pull
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
oxmgr reload queue scheduler horizon   # <-- the step people forget
```

Wire that to a [git webhook](/blog/git-webhook-auto-deploy-nodejs) and pushing to `main` deploys and restarts workers automatically. If a release breaks, [instant rollback](/blog/instant-rollback-deployment) is symlink-back plus another reload.

## nginx in front

php-fpm needs nginx (or Caddy) speaking FastCGI. The [nginx + SSL setup](/blog/nodejs-vps-setup-nginx-ssl) is the same idea; the Laravel-specific bit is the FastCGI location block pointing at the php-fpm socket and `try_files` routing everything to `index.php`.

## The payoff

php-fpm tuned, workers and scheduler supervised, deploys that actually restart the workers, nginx in front. That's the entire Forge feature set you were paying for, running on a $10 VPS you control. The recurring theme: **php-fpm is handled by the system, but your queues and scheduler need a real supervisor** — and that's precisely the gap a process manager fills.
