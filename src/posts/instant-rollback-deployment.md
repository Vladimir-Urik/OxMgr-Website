---
title: Instant Rollback — How to Undo a Bad Deploy in Seconds
description: A deploy strategy where rollback is a first-class operation — release directories, an atomic symlink swap, and a process-manager reload — so undoing a bad release takes seconds, not a redeploy.
date: 2026-09-09
tags: [rollback, deployment, zero-downtime, process-manager, devops, reliability]
keywords: [instant rollback deployment, rollback bad deploy, symlink release deployment, atomic deploy rollback, deployment rollback strategy, undo deploy seconds]
author: Oxmgr Team
---

# Instant Rollback

Every deploy strategy is really two strategies: how you roll *forward* and how you roll *back*. Teams obsess over the first and neglect the second, which is exactly backwards — you deploy on your schedule, but you roll back at the worst possible moment, under pressure, while something is on fire. A good deploy makes rollback a boring, one-command, few-seconds operation. Here's how to build that.

## The core idea: releases are immutable directories

The trick that makes rollback instant is to never deploy *into* your running app. Instead, each deploy is a **new directory**, and a symlink decides which one is live:

```
/srv/myapp/
├── releases/
│   ├── 2026-09-09_14-32-01/
│   ├── 2026-09-09_11-05-44/
│   └── 2026-09-08_22-18-10/
├── shared/            # env files, uploads, persistent stuff
└── current -> releases/2026-09-09_14-32-01
```

`current` always points at the live release. Deploying forward = build a new release dir and repoint the symlink. Rolling back = repoint the symlink at the previous dir. Both are the *same atomic operation in opposite directions* — which is why rollback is as fast and safe as a deploy.

## Step 1: Deploy into a fresh release

```bash
#!/bin/bash
set -e
APP=/srv/myapp
REL="$APP/releases/$(date +%Y-%m-%d_%H-%M-%S)"

git clone --depth 1 file://$APP/repo.git "$REL"
cd "$REL"
ln -s "$APP/shared/.env.production" .env
npm ci && npm run build

# migrations run here, before the switch (keep them backward-compatible)
node dist/migrate.js
```

## Step 2: Switch atomically, then reload

The symlink swap must be atomic so no request ever sees a half-updated directory. `ln -sfn` via a temp name + `mv` is atomic on the same filesystem:

```bash
ln -sfn "$REL" "$APP/current.tmp"
mv -Tf "$APP/current.tmp" "$APP/current"

oxmgr reload web    # picks up the new 'current' with zero downtime
```

Point your process's `working_dir` at the `current` symlink so a reload always runs whatever it points to. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.web]
command = "node dist/server.js"
working_dir = "/srv/myapp/current"
restart_on_exit = true
[processes.web.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 15
```

The `oxmgr reload` does a [readiness-gated rollover](/blog/zero-downtime-deployment) — if the new release fails its [health check](/blog/nodejs-health-checks), the reload doesn't complete and the old instances keep serving.

## Step 3: Rollback is one command

Point `current` at the previous release and reload:

```bash
#!/bin/bash
APP=/srv/myapp
PREV=$(ls -1dt $APP/releases/*/ | sed -n 2p)   # second-newest
ln -sfn "$PREV" "$APP/current.tmp" && mv -Tf "$APP/current.tmp" "$APP/current"
oxmgr reload web
echo "rolled back to $PREV"
```

That's the whole thing. No rebuild, no `git revert`, no waiting on CI. The previous release is already built and sitting on disk, so switching to it takes exactly as long as a reload — seconds.

## Detecting that you need to roll back

Rollback is only instant if you *notice* fast. Wire the signals:

- **Watch the deploy live.** Stream [crash events](/blog/debug-crashes-stderr-tail) during and after the switch: `oxmgr events --filter 'process:crashed' --filter 'health:unhealthy' --process web`. A new release that crash-loops shows up immediately, with its stderr tail.
- **Alert on it.** A [Slack crash alert](/blog/crash-alerts-slack-discord) turns "the new release is failing" into a push notification instead of a support ticket.
- **Gate on health.** Because the reload is health-gated, a release that never gets healthy won't fully take over — but you still want to roll the symlink back so the *next* deploy starts from a known-good base.

## The database caveat

Code rolls back in seconds; **schemas don't**. If your bad release included a destructive migration (dropped a column, changed a type), rolling the code back to a version that expects the old schema will break against the new one. The defense is the expand/contract discipline from [blue-green deploys](/blog/blue-green-deployment-single-server): make migrations additive and backward-compatible, so old and new code both work against the current schema. Then a code rollback is always safe, because no schema change ever assumed only the new code would run.

## Keep the release list tidy

Prune old releases so `releases/` doesn't fill the disk, but keep enough to roll back more than one step:

```bash
ls -1dt /srv/myapp/releases/*/ | tail -n +6 | xargs rm -rf   # keep newest 5
```

## Why this beats "git revert and redeploy"

`git revert` + redeploy is a *forward* deploy of reverted code — it runs the full build and CI, takes minutes, and can itself fail. Symlink rollback runs code that was *already built and already known to work five minutes ago*. When production is down, the difference between "seconds" and "a full deploy cycle" is the difference between a blip and an outage. Build your deploy so that going backward is exactly as cheap as going forward, and rollback stops being scary.
