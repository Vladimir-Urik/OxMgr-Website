---
title: Self-Hosting an Astro SSR App in Production
description: Astro isn't just static — with the Node adapter in standalone mode it's a real SSR server you can self-host. Here's how to build it, run it, supervise it, and put a reverse proxy in front.
date: 2026-09-30
tags: [astro, ssr, self-hosting, node.js, production, devops]
keywords: [astro ssr self hosting, astro node adapter standalone, deploy astro vps, astro server production, astro without netlify, astro process manager, astro reverse proxy]
author: Oxmgr Team
---

# Self-Hosting an Astro SSR App in Production

Astro is famous for shipping zero JavaScript on static sites — but the moment you add on-demand rendering (a dashboard, personalized pages, API routes), it becomes a real SSR server, and that server has to run *somewhere*. The platform tutorials point at Netlify or Vercel. If you'd rather own the box, Astro's Node adapter makes self-hosting straightforward. Here's the setup.

## Step 1: Configure for SSR with the Node adapter

Set `output` and add `@astrojs/node` in **standalone** mode (standalone means Astro ships its own HTTP server; `middleware` mode expects you to bring one):

```bash
npm install @astrojs/node
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',                 // or 'hybrid' for mixed static+SSR
  adapter: node({ mode: 'standalone' }),
});
```

Build it:

```bash
npm run build
```

You get a `dist/` with a `dist/server/entry.mjs` you can run directly:

```bash
node ./dist/server/entry.mjs
```

It listens on `HOST` and `PORT` (default 4321). That's the whole Astro-specific part; the rest is standard Node production practice.

## Step 2: Environment

```bash
HOST=127.0.0.1        # loopback; the proxy faces the internet
PORT=4321
# your app's own env — DB URLs, API keys, etc.
```

`hybrid`/`server` Astro can read secrets server-side; keep them in an env file loaded [the secure way](/blog/nodejs-environment-variables-production), and remember that anything referenced in client-side islands is public.

## Step 3: Supervise it

`node entry.mjs` in a terminal is a demo. Production wants crash recovery, reboot survival, and health-gated reloads. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.web]
command = "node ./dist/server/entry.mjs"
working_dir = "/srv/myapp"
restart_on_exit = true

[processes.web.env]
HOST = "127.0.0.1"
PORT = "4321"

[processes.web.health_check]
endpoint = "http://localhost:4321/"
interval_secs = 30
```

Add an Astro API route like `src/pages/healthz.ts` returning a 200 and point the [health check](/blog/nodejs-health-checks) at `/healthz` for a cleaner readiness signal.

## Step 4: Multiple instances for multiple cores

Astro's Node server is single-process. To use the whole box, run several instances behind the proxy:

```toml
[processes.web]
command = "node ./dist/server/entry.mjs"
instances = 2
restart_on_exit = true
```

Astro SSR is usually IO-bound (fetching data to render), so 2 instances on a small box is often plenty — the [clustering guide](/blog/nodejs-clustering-multi-core) covers when you'd want more. Lean on Astro's per-route rendering: keep genuinely static pages static (`hybrid` output) so only the dynamic routes hit the server at all.

## Step 5: Reverse proxy + SSL, serving assets from disk

Front Astro with Caddy or nginx for TLS and to serve `dist/client` (hashed, immutable assets) directly, keeping them off the Node process:

```
yourapp.com {
    encode zstd gzip
    handle /_astro/* {
        root * /srv/myapp/dist/client
        file_server
    }
    reverse_proxy 127.0.0.1:4321
}
```

Serving `/_astro/*` from disk means the Node server only handles actual SSR. The [nginx + SSL guide](/blog/nodejs-vps-setup-nginx-ssl) covers the nginx equivalent; the [reverse proxy comparison](/blog/reverse-proxy-process-manager-comparison) covers picking between them.

## Step 6: Zero-downtime deploys

Deploy = pull, `npm ci`, `npm run build`, `oxmgr reload web` for a [zero-downtime rollover](/blog/zero-downtime-deployment). Drive it from a [git webhook](/blog/git-webhook-auto-deploy-nodejs) so pushing to `main` ships automatically. Because `dist/` is self-contained, keep the previous build around for [instant rollback](/blog/instant-rollback-deployment).

## Static vs SSR — a quick reminder

If your Astro site is *fully* static (`output: 'static'`, the default), you don't need any of this — just build and let the reverse proxy serve `dist/` as files, no Node process at all. This guide is specifically for the SSR/hybrid case where on-demand rendering means a long-running server. The nice thing about Astro is you choose per route: static where you can, SSR where you must, and only the SSR part needs supervising.

Self-hosting Astro SSR gives you the usual trio — flat pricing, colocation with your data, and no platform cold starts — in exchange for owning uptime, which a process manager and a reverse proxy handle. Set it once and it's quiet to run.
