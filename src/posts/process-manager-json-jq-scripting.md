---
title: Scripting Your Process Manager with `oxmgr list --json` and jq
description: The `--json` flag turns Oxmgr into a scriptable building block. Here are real recipes — health gates, memory watchdogs, deploy checks, and CI assertions — using `oxmgr list --json` and jq.
date: 2026-07-17
tags: [oxmgr, json, jq, scripting, automation, devops]
keywords: [oxmgr list json, process manager json output, jq process manager, oxmgr scripting, oxmgr ls json, automate process manager, devops jq recipes]
author: Oxmgr Team
---

# Scripting Your Process Manager with `oxmgr list --json` and jq

Human-readable tables are great in a terminal and terrible in a script. The moment you try to `grep` and `awk` a process list, you're parsing column positions that break the first time a process name gets long.

`oxmgr list --json` (alias `oxmgr ls --json`) skips all of that. It emits a clean JSON array — one object per process, with the full schema — that you pipe straight into `jq`. Empty lists emit `[]`, so you never have to special-case "nothing running."

## The shape of the data

Each entry mirrors the internal process schema:

```bash
oxmgr ls --json | jq '.[0]'
```

```json
{
  "id": "a1b2c3",
  "name": "api",
  "command": "node dist/server.js",
  "args": [],
  "status": "online",
  "pid": 48213,
  "cpu_percent": 2.4,
  "memory_bytes": 78643200,
  "restart_count": 0,
  "cluster_mode": true,
  "health_status": "healthy"
}
```

Everything you'd want to assert on is there: `status`, `pid`, `memory_bytes`, `restart_count`, `health_status`. Now the recipes.

## Recipe 1: Is everything online?

A deploy smoke test — exit non-zero if any process isn't online:

```bash
if oxmgr ls --json | jq -e 'all(.[]; .status == "online")' > /dev/null; then
  echo "✅ all processes online"
else
  echo "❌ something is down"
  oxmgr ls --json | jq -r '.[] | select(.status != "online") | .name'
  exit 1
fi
```

Drop this at the end of your [deploy script](/blog/how-to-deploy-nodejs-production) and a failed boot fails the deploy instead of silently limping.

## Recipe 2: Memory watchdog

Print any process over 500 MB, sorted by usage:

```bash
oxmgr ls --json \
  | jq -r '.[] | select(.memory_bytes > 500e6)
           | "\(.name)\t\(.memory_bytes / 1e6 | floor)MB"' \
  | sort -k2 -n -r
```

Wrap it in a cron job and you have a cheap [memory-leak](/blog/nodejs-memory-leaks-production) early warning. For hard caps that restart automatically, use [resource limits](/blog/nodejs-resource-limits-production) instead — but this is a good way to find the threshold first.

## Recipe 3: Restart-count alarm

A process that quietly restarts 40 times is "online" but not healthy:

```bash
oxmgr ls --json \
  | jq -r '.[] | select(.restart_count > 5)
           | "⚠️  \(.name) has restarted \(.restart_count) times"'
```

Restart count is the metric [crash-looping apps](/blog/nodejs-app-keeps-crashing) reveal themselves through long before they page anyone.

## Recipe 4: Health gate for a load balancer

Want your reverse proxy to only route to a box where the app reports healthy? Expose a tiny check:

```bash
#!/bin/sh
# healthy.sh — exit 0 only if "api" is online AND health is healthy
oxmgr ls --json \
  | jq -e '.[] | select(.name == "api")
           | select(.status == "online" and .health_status == "healthy")' \
  > /dev/null
```

Point an nginx/Caddy [health check](/blog/reverse-proxy-process-manager-comparison) or your orchestration at this and rolling deploys become safe by construction.

## Recipe 5: A one-line status for CI

CI logs love flat key/value output:

```bash
oxmgr ls --json | jq -r '.[] | "\(.name)=\(.status)"'
# api=online
# worker=online
# scheduler=stopped
```

## Recipe 6: Total footprint

Sum memory across everything Oxmgr manages — useful for right-sizing a VPS (see [How Much VPS Do You Actually Need?](/blog/how-much-vps-do-you-need)):

```bash
oxmgr ls --json \
  | jq '[.[].memory_bytes] | add / 1e6 | floor | "\(.)MB total"'
```

## Pairing with the event stream

`oxmgr ls --json` gives you a **snapshot**; the [event bus](/blog/process-manager-event-bus) gives you the **changes**. The two compose naturally: poll the JSON on a schedule for dashboards and reports, subscribe to events for anything that has to react instantly. A common pattern is to render a table from `--json` and refresh it whenever a `process:*` event arrives, so you get live state without a fast polling loop.

## Why JSON output matters

The point of `--json` isn't the flag — it's that it makes Oxmgr a *composable* tool. A process manager that only speaks to humans forces you to build brittle scrapers. One that speaks JSON drops into pipelines, CI, cron, and dashboards without ceremony. Anything you can express in `jq`, you can now assert about your running processes — which is most of the operational questions you actually ask.
