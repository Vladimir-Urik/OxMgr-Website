---
title: Self-Hosting Nuxt 3 in Production — A Guide That Doesn't Mention Vercel
description: Deploy a Nuxt 3 app on your own VPS with the Node preset — build with Nitro, run the server, put a reverse proxy in front, and supervise it. Full control, no per-request pricing.
date: 2026-08-25
tags: [nuxt, vue, self-hosting, nitro, node.js, production, devops]
keywords: [nuxt self hosting, nuxt 3 production server, deploy nuxt vps, nuxt nitro node server, nuxt without vercel, nuxt process manager, nuxt reverse proxy]
author: Oxmgr Team
---

# Self-Hosting Nuxt 3 in Production

Nuxt 3's server engine, Nitro, can build for dozens of targets — but the one nobody demos is the simplest and most powerful: a plain Node server you run on your own box. Self-hosting Nuxt means you own the runtime, pay flat VPS pricing instead of per-request, and can colocate with your database. Here's the setup end to end.

## Step 1: Build for the Node preset

Nitro's default `build` output is already a Node server. Just build:

```bash
npm run build
```

This produces `.output/` — a self-contained Node application. Run it:

```bash
node .output/server/index.mjs
```

It listens on `PORT` (default 3000) and `HOST`. If you want to be explicit, set the preset:

```js
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: { preset: 'node-server' }
});
```

The `.output/` directory is everything — server, client bundle, and public assets. That self-containment makes deploys and [rollbacks](/blog/instant-rollback-deployment) trivial: swap the directory, restart.

## Step 2: Runtime config and env

Nuxt reads runtime config from env vars prefixed `NUXT_`. Set the essentials:

```bash
PORT=3000
HOST=127.0.0.1                    # loopback; the proxy faces the internet
NUXT_PUBLIC_SITE_URL=https://yourapp.com
# any NUXT_ / NUXT_PUBLIC_ vars your app declares in runtimeConfig
```

Keep these in an env file loaded [the secure way](/blog/nodejs-environment-variables-production). Public runtime config (`NUXT_PUBLIC_*`) is exposed to the browser — never put secrets there; use unprefixed `NUXT_` server-only keys for those.

## Step 3: Supervise it

`node .output/server/index.mjs` in a shell is a demo. Production wants crash recovery, reboot survival, and health-gated reloads. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.web]
command = "node .output/server/index.mjs"
working_dir = "/srv/myapp"
restart_on_exit = true

[processes.web.env]
PORT = "3000"
HOST = "127.0.0.1"
NUXT_PUBLIC_SITE_URL = "https://yourapp.com"

[processes.web.health_check]
endpoint = "http://localhost:3000/"
interval_secs = 30
```

Add a Nitro server route like `server/routes/healthz.ts` returning 200, and point the [health check](/blog/nodejs-health-checks) at `/healthz` for a cleaner readiness signal than the homepage.

## Step 4: Multiple instances for multiple cores

Nitro's Node server is single-process, so it uses one core. Run several instances behind the proxy to use the whole box:

```toml
[processes.web]
command = "node .output/server/index.mjs"
instances = 4
restart_on_exit = true
```

For an SSR app that's mostly IO-bound on API/data fetching, 2–4 instances on a 4-core VPS is the sweet spot — the same reasoning as [Node clustering](/blog/nodejs-clustering-multi-core). Cache what you can with Nitro's route rules (`routeRules` with `swr` / `isr`) to take load off SSR entirely.

## Step 5: Reverse proxy + SSL

Front it with Caddy or nginx for TLS, HTTP/2, compression, and serving the static assets in `.output/public` directly. A minimal Caddyfile:

```
yourapp.com {
    encode zstd gzip
    handle /_nuxt/* {
        root * /srv/myapp/.output/public
        file_server
    }
    reverse_proxy 127.0.0.1:3000
}
```

Serving `/_nuxt/*` (hashed, immutable assets) from disk keeps them off the Node process entirely. The [nginx + SSL guide](/blog/nodejs-vps-setup-nginx-ssl) covers the nginx equivalent, and the [reverse proxy comparison](/blog/reverse-proxy-process-manager-comparison) covers the Caddy/nginx/Traefik choice.

## Step 6: Zero-downtime deploys

Deploy = pull, `npm ci`, `npm run build`, `oxmgr reload web` for a [zero-downtime rollover](/blog/zero-downtime-deployment). Drive it from a [git webhook](/blog/git-webhook-auto-deploy-nodejs) so pushing to `main` ships automatically. Because `.output/` is self-contained, keep the previous build directory around and rollback is instant.

## Why bother self-hosting Nuxt

The same three reasons as any SSR framework: **flat pricing** (a $10 VPS serves a lot of SSR with no per-invocation cost), **colocation** (Nuxt and Postgres on one box = tiny DB latency), and **control** (no cold starts, no platform-specific quirks in your `nitro` config). You take on uptime — which is exactly the job of a process manager and a reverse proxy. Set it once and a self-hosted Nuxt app is quiet to run.
