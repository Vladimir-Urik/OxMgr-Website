---
title: Self-Hosting a SvelteKit App in Production (2026 Guide)
description: How to deploy a SvelteKit app on your own VPS with adapter-node — build, run the Node server, put a reverse proxy in front, and keep it alive with a process manager. No Vercel required.
date: 2026-08-16
tags: [sveltekit, self-hosting, node.js, adapter-node, production, devops]
keywords: [sveltekit self hosting, sveltekit adapter-node, deploy sveltekit vps, sveltekit production server, sveltekit without vercel, sveltekit node server, sveltekit reverse proxy]
author: Oxmgr Team
---

# Self-Hosting a SvelteKit App in Production

SvelteKit is often shown deploying to Vercel or Cloudflare with a single adapter swap, which is great — until you want to own the box, avoid per-request pricing, or run alongside a database on the same server. Self-hosting SvelteKit is genuinely simple: `adapter-node` turns your app into a plain Node server, and from there it's the same story as any Node service.

## Step 1: Switch to adapter-node

Install the Node adapter and point your config at it:

```bash
npm install -D @sveltejs/adapter-node
```

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-node';

export default {
  kit: {
    adapter: adapter({ out: 'build' })
  }
};
```

Build it:

```bash
npm run build
```

You now have a standalone Node server in `build/`. Run it with:

```bash
node build
```

By default it listens on `PORT` (default 3000) and `HOST`. That's the whole "SvelteKit-specific" part — everything after this is generic Node production practice.

## Step 2: Environment and the origin gotcha

SvelteKit's Node server needs a few env vars set correctly in production, or you'll hit confusing bugs:

```bash
PORT=3000
HOST=127.0.0.1          # bind to loopback; the proxy faces the internet
ORIGIN=https://yourapp.com   # REQUIRED for form actions / CSRF to work behind a proxy
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
BODY_SIZE_LIMIT=10M
```

The one that bites everyone is **`ORIGIN`**. Without it, POST form actions fail CSRF checks behind a reverse proxy. Set it to your public URL. Keep these in an env file managed [the right way](/blog/nodejs-environment-variables-production), not hardcoded.

## Step 3: Supervise it

`node build` in a terminal isn't a deployment. You want crash recovery, reboot survival, and health-gated reloads. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.web]
command = "node build"
working_dir = "/srv/myapp"
restart_on_exit = true

[processes.web.env]
PORT = "3000"
HOST = "127.0.0.1"
ORIGIN = "https://yourapp.com"
PROTOCOL_HEADER = "x-forwarded-proto"
HOST_HEADER = "x-forwarded-host"

[processes.web.health_check]
endpoint = "http://localhost:3000/"
interval_secs = 30
```

Add a lightweight `+server.js` health route (returning 200) and point the [health check](/blog/nodejs-health-checks) at it for a cleaner readiness signal than the homepage.

## Step 4: Use all your cores

A single Node process uses one core. SvelteKit's server is a standard Node HTTP server, so it scales the same way any Node app does — either via [clustering](/blog/nodejs-clustering-multi-core) or, more simply, by running multiple instances behind the proxy:

```toml
[processes.web]
command = "node build"
instances = 4
restart_on_exit = true
```

Each instance needs its own port, or you use a cluster setup so they share one. For most SvelteKit apps (SSR that's IO-bound on data fetching), 2–4 instances on a 4-core box is plenty — see [worker threads vs cluster](/blog/nodejs-worker-threads-vs-cluster) for when you'd need more.

## Step 5: Reverse proxy + SSL

Put Caddy or nginx in front for TLS termination, HTTP/2, and serving the immutable `build/client` assets directly (don't make Node serve static files it doesn't have to). The [nginx + SSL VPS guide](/blog/nodejs-vps-setup-nginx-ssl) applies directly; a minimal Caddyfile is just:

```
yourapp.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Caddy handles Let's Encrypt automatically. For the Caddy vs nginx vs Traefik trade-offs, see the [reverse proxy comparison](/blog/reverse-proxy-process-manager-comparison).

## Step 6: Deploy without downtime

Your deploy is: pull, `npm ci`, `npm run build`, then `oxmgr reload web` for a [zero-downtime rollover](/blog/zero-downtime-deployment). Drive it from a [git webhook](/blog/git-webhook-auto-deploy-nodejs) and pushing to `main` ships to production. Because the build is a self-contained `build/` directory, [rollback](/blog/instant-rollback-deployment) is just pointing at the previous build and reloading.

## Why self-host SvelteKit at all

Three honest reasons: **cost** (a $10 VPS runs a lot of SSR traffic with no per-request billing), **colocation** (your app and its Postgres on the same box means sub-millisecond DB latency), and **control** (no cold starts, no platform limits, no adapter surprises). The trade is that you own uptime — which is exactly what a process manager plus a reverse proxy is for. Once it's set up, a self-hosted SvelteKit app is boring to operate, which is the goal.
