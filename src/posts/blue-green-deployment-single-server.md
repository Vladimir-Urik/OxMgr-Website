---
title: Blue-Green Deployments on a Single Server (Without Kubernetes)
description: You don't need a cluster to do blue-green deploys. Here's how to run two versions side by side on one VPS, health-check the new one, and flip traffic atomically with a reverse proxy.
date: 2026-09-06
tags: [blue-green, deployment, zero-downtime, reverse-proxy, process-manager, devops]
keywords: [blue green deployment vps, blue green single server, zero downtime deploy without kubernetes, blue green nginx caddy, atomic traffic switch, blue green process manager]
author: Oxmgr Team
---

# Blue-Green Deployments on a Single Server

Blue-green deployment sounds like a big-infrastructure technique — two environments, a load balancer, a cluster. It isn't. The core idea works perfectly on one VPS: run the *new* version alongside the *old* one, verify the new one is actually healthy, then flip all traffic to it in one atomic move. If the new version is broken, you flip back instantly. Here's how to do it with nothing but a process manager and a reverse proxy.

## The idea

- **Blue** is the version currently serving traffic.
- **Green** is the new version you just deployed.

You start green on a *different port*, wait until its [health check](/blog/nodejs-health-checks) passes, then point the reverse proxy at green and stop blue. Traffic switches from one healthy version to another with zero dropped requests — and rollback is just pointing back at blue.

This is different from a [rolling reload](/blog/zero-downtime-deployment) (which replaces instances in place). Blue-green keeps the *entire old version* running and untouched until you're certain, which makes rollback truly instant and risk-free.

## Step 1: Two process definitions, two ports

Define both colors, each on its own port. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.app-blue]
command = "node dist/server.js"
restart_on_exit = true
[processes.app-blue.env]
PORT = "3001"
[processes.app-blue.health_check]
endpoint = "http://localhost:3001/health"
interval_secs = 10

[processes.app-green]
command = "node dist/server.js"
restart_on_exit = true
[processes.app-green.env]
PORT = "3002"
[processes.app-green.health_check]
endpoint = "http://localhost:3002/health"
interval_secs = 10
```

At any moment, only one color is running and receiving traffic. The other is stopped.

## Step 2: Proxy points at an upstream you can swap

The reverse proxy points at a single upstream definition that you change and reload. With nginx, keep the active port in an included file:

```nginx
# /etc/nginx/conf.d/upstream.conf
upstream app { server 127.0.0.1:3001; }   # currently blue
```

```nginx
location / { proxy_pass http://app; }
```

Switching colors = rewrite that one line and `nginx -s reload` (which is itself graceful — nginx finishes in-flight requests on old workers). Caddy works the same way with an env var or an admin-API upstream change.

## Step 3: The deploy script

The whole dance, driven by which color is currently live:

```bash
#!/bin/bash
set -e

# Which color is live right now?
CURRENT=$(grep -oP '300\d' /etc/nginx/conf.d/upstream.conf)
if [ "$CURRENT" = "3001" ]; then NEW=green; NEWPORT=3002; else NEW=blue; NEWPORT=3001; fi

echo "Deploying to $NEW ($NEWPORT)…"
git pull && npm ci && npm run build

# Start the new color
oxmgr start app-$NEW

# Wait for it to report healthy before touching traffic
for i in $(seq 1 30); do
  if oxmgr ls --json | jq -e --arg n "app-$NEW" \
      '.[] | select(.name==$n and .health_status=="healthy")' >/dev/null; then
    echo "$NEW is healthy"; break
  fi
  sleep 2
  [ "$i" = "30" ] && { echo "green never got healthy — aborting"; oxmgr stop app-$NEW; exit 1; }
done

# Flip traffic atomically
sed -i "s/300[0-9]/$NEWPORT/" /etc/nginx/conf.d/upstream.conf
nginx -s reload
echo "traffic now on $NEW"

# Stop the old color
OLD=$([ "$NEW" = "green" ] && echo blue || echo green)
oxmgr stop app-$OLD
```

The critical line is the health-gate loop: **traffic never flips until the new version reports healthy.** That check uses the [`oxmgr ls --json`](/blog/process-manager-json-jq-scripting) health status, so a green build that boots but fails its readiness check aborts the deploy with old traffic untouched.

## Step 4: Instant rollback

Because blue is still deployed (just stopped), rollback is trivial — start it and flip back:

```bash
oxmgr start app-blue
sed -i "s/300[0-9]/3001/" /etc/nginx/conf.d/upstream.conf
nginx -s reload
```

Seconds, not a redeploy. This is the whole point — see [instant rollback](/blog/instant-rollback-deployment) for the general pattern.

## Blue-green vs rolling reload — which to use

| | Rolling reload | Blue-green |
|---|---|---|
| Old version during deploy | Replaced instance by instance | Kept fully running |
| Rollback | Redeploy old code | Flip proxy back (instant) |
| Resource cost | ~1× | ~2× briefly (both colors up) |
| Best for | Frequent, low-risk deploys | Risky releases, DB-compatible changes |

Use [rolling reloads](/blog/zero-downtime-deployment) for everyday deploys where you trust the change. Use blue-green when a release is scary enough that you want the *entire* previous version sitting there, warm, ready to take traffic back in one command.

## The one caveat: databases

Blue-green is clean for *stateless* app code. The moment a release includes a **schema migration**, both colors share one database, so your migration must be backward-compatible — green's new code and blue's old code both have to work against the migrated schema during the overlap. That's the expand/contract migration pattern, and it's a discipline worth adopting regardless: make schema changes additive, deploy code that works with both shapes, then remove the old columns in a later release.

On a single VPS, blue-green costs you a second copy of the app running for a minute during deploys — cheap insurance for a truly instant, truly safe rollback.
