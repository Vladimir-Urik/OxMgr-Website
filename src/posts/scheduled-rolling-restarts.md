---
title: Scheduled and Rolling Restarts — Keeping Long-Running Apps Fresh
description: Sometimes the pragmatic fix for a slow leak is a scheduled restart. Here's how to do periodic and rolling restarts safely — at low-traffic hours, one instance at a time, without dropping requests.
date: 2026-09-27
tags: [restart, scheduled-restart, rolling-restart, memory, process-manager, devops]
keywords: [scheduled restart nodejs, cron restart app, rolling restart zero downtime, periodic restart memory leak, restart app nightly, process manager scheduled restart]
author: Oxmgr Team
---

# Scheduled and Rolling Restarts

There's a purist view that a scheduled restart is admitting defeat — you should just fix the leak. There's also a pragmatic view: some leaks live in dependencies you don't control, some fixes cost a week you don't have, and a nightly restart at 4 a.m. costs nothing and buys you stability today. Both views are right. This post is about doing the pragmatic thing *well*, so a scheduled restart is a safety net, not a band-aid that drops requests.

## When a scheduled restart is legitimate

Reach for it when:

- A [slow memory leak](/blog/nodejs-memory-leaks-production) lives in a third-party library and creeps up over days.
- Native modules fragment memory over time (common in image processing, some DB drivers).
- You want a hard reset of connection pools, caches, or file handles on a predictable cadence.
- You're buying time to ship a real fix without paging anyone in the meantime.

When *not* to: as a substitute for investigating a *fast* leak (that's a code bug — a nightly restart just hides a crash loop), or to paper over a process that crashes every few minutes.

## The wrong way: restart everything at once

```bash
# DON'T: drops every in-flight request at 4am
0 4 * * * oxmgr restart api
```

If `api` is a single instance, this is a hard bounce — every connected client gets an error for the second it takes to restart. Even at 4 a.m. someone's mid-request. There are two better ways.

## The right way #1: rolling restart across instances

If you run multiple [instances](/blog/nodejs-clustering-multi-core), restart them *one at a time* so the others keep serving. That's exactly what a [zero-downtime reload](/blog/zero-downtime-deployment) does:

```bash
# Rolling — one instance at a time, health-gated, no dropped requests
0 4 * * * oxmgr reload api
```

`oxmgr reload` brings up a fresh instance, waits for its [health check](/blog/nodejs-health-checks) to pass, drains an old one, and repeats. Scheduled nightly, that's a full fleet refresh with zero downtime — the leaked memory is gone by morning and nobody noticed.

## The right way #2: config-driven scheduled restart

Rather than an external crontab line, some setups let you declare the schedule alongside the process, so it's version-controlled with everything else. Conceptually:

```toml
[processes.api]
command = "node dist/server.js"
instances = 4
restart_on_exit = true
# a nightly rolling restart, declared with the process it applies to
cron_restart = "0 4 * * *"
```

Keeping the schedule *in the config file* means it's reviewed in PRs and travels with the app — no hidden crontab entry that the next engineer doesn't know exists. (This mirrors PM2's `cron_restart`; the [PM2 migration guide](/blog/migrate-from-pm2-to-oxmgr) maps it over.)

## Restart at the *right* time

"Low traffic" isn't 4 a.m. for everyone — check *your* traffic. A quick way: your [Grafana request-rate panel](/blog/prometheus-grafana-process-metrics) shows the daily trough. For a global audience there may be no truly quiet hour, which is the strongest argument for a *rolling* restart — with rolling, the timing barely matters because you never drop traffic anyway.

## Restart *before* the problem, not after

A fixed schedule is simple but dumb — it restarts whether or not memory is actually high. A smarter safety net is threshold-based: recycle a process when it crosses a memory line, using [resource limits](/blog/nodejs-resource-limits-production):

```toml
[processes.api.limits]
memory = "600M"     # recycle this instance when it exceeds 600 MB
```

This is strictly better than a timer for leaks: it acts exactly when needed, and it protects you from the [OOM killer](/blog/linux-oom-killer-nodejs) regardless of what time the leak crosses the line. Many teams run *both* — a memory cap for the fast case, a nightly rolling reload for the slow, fragmenting case.

## Make sure restarts are graceful

A scheduled restart that drops in-flight work isn't a safety net, it's scheduled damage. Whichever trigger you use, ensure the process does a [graceful shutdown](/blog/nodejs-graceful-shutdown-complete-guide) — stop accepting new work, finish in-flight requests, close connections — before it's replaced. Set a `stop_timeout_ms` generous enough for your longest normal request so the manager waits for the drain instead of killing mid-flight.

## Watch that it's working

Confirm your scheduled restart is doing its job, not silently failing:

```bash
# See the nightly reload happen, live
oxmgr events --filter 'process:restarting' --process api
```

If you see the reload fire at 4 a.m. and memory drops back to baseline on your [dashboard](/blog/live-process-dashboard-event-socket), the safety net is holding.

## The honest position

Scheduled restarts get a bad reputation because people do them badly — a hard `restart` of a single instance that drops traffic, hiding a fast crash loop. Done well, they're none of that: a *rolling* restart of *multiple* instances (or a *threshold-based* recycle), scheduled for *your* quiet window, with *graceful* shutdown, and *monitored*. That's not defeat — that's a resilient operator using every tool available while the real fix ships. Keep chasing the leak; keep the net up until you catch it.
