---
title: Self-Hosting Next.js in 2026 — A Production Guide That Doesn't Mention Vercel
description: Vercel is great. It's also not the only way to run Next.js. Here's a complete production setup for self-hosting Next.js on a VPS, including process management, SSL, caching, and ISR.
date: 2026-06-11
tags: [nextjs, self-hosting, production, vercel-alternative, devops]
keywords: [self-host nextjs, nextjs production deployment, nextjs vps, nextjs without vercel, nextjs process manager, nextjs pm2, nextjs production server, nextjs standalone deployment]
author: Oxmgr Team
---

# Self-Hosting Next.js in 2026

Vercel built Next.js, so Vercel is the smoothest place to deploy it. That's not in dispute. What's also true: a $6 VPS can serve a Next.js site that handles a few thousand requests per minute, and you'll never get a surprise bandwidth bill. For projects where predictable cost and full control matter more than zero-config edge routing, self-hosting is the right call.

This guide is the end-to-end production setup: build, supervise, reverse proxy, SSL, ISR, and the gotchas that don't show up until your first 3 AM page.

## The `standalone` Output Mode

This is the only thing you have to get right. In `next.config.js`:

```js
/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
};
```

After `next build`, you get `.next/standalone/` containing a `server.js`, a minimal `node_modules`, and only the dependencies your app actually uses. You still need to copy two directories alongside it:

```bash
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
```

The resulting `.next/standalone/` is your entire deploy artifact. Tar it, scp it, or rsync it. You no longer need to ship `node_modules` or `npm install` on the server. This alone cuts deploy times by 80%.

## Running It

The server is just a Node script:

```bash
HOSTNAME=0.0.0.0 PORT=3000 node server.js
```

That's the thing your supervisor needs to keep alive.

## Supervision with a Process Manager

Next.js apps deserve a real supervisor for the same reasons every other long-running Node process does: crashes happen, deploys happen, and you need a way to drain in-flight requests before stopping. PM2 is the historical default. [Oxmgr](https://oxmgr.empellio.com) does the same job without being a Node app itself:

```toml
# oxfile.toml
[processes.web]
command = "node server.js"
cwd = "/srv/myapp"
env = { NODE_ENV = "production", PORT = "3000", HOSTNAME = "127.0.0.1" }
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "20s"

[processes.web.health]
type = "http"
url = "http://127.0.0.1:3000/api/health"
interval = "10s"

[processes.web.limits]
memory = "768M"
```

Note `HOSTNAME=127.0.0.1` — don't bind Next.js directly to the public interface. Always go through a reverse proxy.

For a deeper comparison of supervisor options, see [process manager comparison](/blog/process-manager-comparison).

## Health Endpoint

Add a tiny route at `app/api/health/route.ts`:

```ts
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response('ok', { status: 200 });
}
```

`force-dynamic` matters — without it, Next will try to cache the health response at build time, defeating the point.

## Reverse Proxy with Caddy

Caddy is the lowest-effort production reverse proxy with automatic SSL:

```caddyfile
example.com {
    encode zstd gzip

    @static path /_next/static/* /favicon.ico /robots.txt
    handle @static {
        reverse_proxy 127.0.0.1:3000
        header Cache-Control "public, max-age=31536000, immutable"
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

The `@static` matcher adds an aggressive cache header for content-hashed assets, which Next produces in `_next/static/`. Browsers will cache those for a year — which is fine because the hashes change when the content does.

nginx works too; the [Node.js VPS setup with nginx and SSL guide](/blog/nodejs-vps-setup-nginx-ssl) has a complete config.

## Image Optimization

Next's image optimizer runs in the Node process by default. On a small VPS this is fine for moderate traffic, but it can spike CPU on cold images. Two options:

**Option A:** Trust the default and set sensible cache headers (the proxy config above handles the static side).

**Option B:** Disable runtime optimization and pre-optimize at build time:

```js
module.exports = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
};
```

This puts the optimization burden on you (or a CDN), but the Node process stays predictable.

## ISR and On-Demand Revalidation

ISR (Incremental Static Regeneration) works in self-hosted mode without changes. Pages with `revalidate` will regenerate on the server when the timer expires. The catch: the regenerated HTML lives in `.next/cache/` on the box where it regenerated. If you scale to multiple boxes later, you'll need a shared cache (`@neshca/cache-handler` with Redis is the common choice).

For a single-box deployment, the default filesystem cache is fine.

## Static Assets and Bandwidth

If your traffic is mostly users in one region and bandwidth is modest, serve everything from the VPS. If you're shipping a lot of images or your audience is global, put Cloudflare in front. Cloudflare's free tier caches static assets at the edge and gives you DDoS protection at no cost. Origin pull rules with `Cache-Control` headers from Caddy do the heavy lifting.

## Environment Variables

Next.js bakes `NEXT_PUBLIC_*` variables at build time and reads server-only variables at runtime. Two implications:

1. Public variables change → you need to rebuild.
2. Server-only secrets can be supplied at startup via your supervisor's `env_file` directive.

The [env vars guide](/blog/nodejs-environment-variables-production) covers the patterns; the Next-specific thing to remember is that build-time variables are *in the bundle* — don't put secrets in `NEXT_PUBLIC_*`.

## Graceful Shutdown

The standalone server already handles `SIGTERM` correctly: it stops accepting new connections and waits for active requests to finish. Your supervisor needs to send `SIGTERM` (not `SIGKILL`) and give it enough time. 20 seconds is a safe default for most apps — 30 if you have long-running API routes.

If your supervisor sends `SIGKILL` too early, you'll see truncated responses in your logs. The default `oxfile.toml` `stop_timeout = "20s"` is calibrated for this.

## Deploys: The Rsync Pattern

For solo projects and small teams, this loop is faster than any container pipeline:

```bash
# locally
npm run build
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
rsync -az --delete .next/standalone/ deploy@vps:/srv/myapp.new/

# on server (via SSH)
mv /srv/myapp /srv/myapp.old && mv /srv/myapp.new /srv/myapp
oxm reload web
rm -rf /srv/myapp.old
```

That's a complete deploy in 10 seconds for most apps. No Docker build, no registry push, no waiting for CI.

For automated webhook-driven deploys, see the [git webhook deploy guide](/blog/git-webhook-auto-deploy-nodejs).

## Common Pitfalls

- **Forgetting to copy `public/` and `.next/static/`.** The standalone build doesn't include them. Your CSS will 404.
- **Binding to `0.0.0.0`.** Bind to `127.0.0.1` and let the reverse proxy face the public interface. This isolates SSL, gzip, and rate limiting from your app.
- **Missing `HOSTNAME` env var.** Next will bind to the wrong interface if you don't set it.
- **Memory leaks from large RSC payloads.** Set a memory cap on the supervisor side so a leak is a restart, not an OOM event. The [Node.js memory leaks guide](/blog/nodejs-memory-leaks-production) covers diagnosis.
- **No health check.** A Next process can be "running" while the React rendering pipeline is stuck. The `/api/health` route gives your supervisor a real signal.

## Zero-Downtime: Worth It?

For a marketing site with 100 requests per minute, a 2-second restart during deploy is invisible. For an app with active user sessions, a brief blip is annoying but recoverable. For real zero-downtime, run two instances on adjacent ports and shift Caddy's `reverse_proxy` to the new one before stopping the old. The [zero-downtime deployment post](/blog/zero-downtime-deployment) covers the pattern.

For most self-hosted Next sites, a clean 2-second restart is the right trade-off.

## Bottom Line

Self-hosted Next.js in 2026 is not the second-class citizen the docs sometimes make it look like. `output: 'standalone'`, a real supervisor, a reverse proxy with auto-SSL — that's the whole stack. The result is a Next site you fully control, with predictable monthly costs, and no surprise behaviour at the platform layer.

If you want a supervisor that handles Next without being a Node app itself, [Oxmgr](https://oxmgr.empellio.com) is one config file and one binary on the server.
