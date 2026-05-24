---
title: Self-Hosting Deno in Production — Beyond Deno Deploy
description: Deno Deploy is convenient, but self-hosting Deno on your own VPS gives you control, predictable costs, and no cold starts. Here's the production setup that just works.
date: 2026-06-04
tags: [deno, self-hosting, production, process-manager, devops]
keywords: [self-host deno, deno production, deno process manager, deno systemd, deno deploy alternative, run deno in production, deno vps, deno restart on crash]
author: Oxmgr Team
---

# Self-Hosting Deno in Production

Deno Deploy is a great default. It's fast, it scales, and it bills predictably for small projects. But there are situations where running Deno on your own box makes more sense: workloads that need long-lived state, apps that bottleneck on egress, projects already paying for a VPS, or anything that needs filesystem access beyond Deno KV.

The self-hosting story for Deno is shorter than for Node — there's no `npm`, no `node_modules`, no compilation step in most cases. But it still needs supervision, logging, and a sane lifecycle. This post walks through a production setup that doesn't depend on Deno Deploy at all.

## What You're Replacing

Deno Deploy handles four things for you:

1. Process supervision (keeps your app alive).
2. TLS termination.
3. Routing across regions.
4. Logs and metrics.

Self-hosting replaces them with: a process manager, a reverse proxy (Caddy or nginx), and stdout/stderr files. You give up the multi-region piece — but for most apps under a few thousand requests per second, a single well-placed VPS is more than enough.

## Installing Deno on a VPS

Skip the curl-pipe-bash dance and use the official installer for the deploy user:

```bash
sudo adduser --system --group --shell /bin/bash deploy
sudo -u deploy bash -c 'curl -fsSL https://deno.land/install.sh | sh'
```

Now `/home/deploy/.deno/bin/deno` exists. Add it to your supervisor's PATH or reference the full path — don't rely on shell profile loading.

## A Minimal Production Server

```ts
// server.ts
const port = Number(Deno.env.get("PORT") ?? 8000);

const handler = (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }
  return new Response("hello from deno");
};

const server = Deno.serve({ port, handler });

const shutdown = async () => {
  console.log("draining...");
  await server.shutdown();
  Deno.exit(0);
};

Deno.addSignalListener("SIGTERM", shutdown);
Deno.addSignalListener("SIGINT", shutdown);
```

`server.shutdown()` is the Deno equivalent of Bun's `server.stop(false)` — it stops accepting new connections and drains existing ones.

## Permissions: The Production Set

Deno's permission model is one of its biggest wins. In production, declare exactly what your app needs and nothing more:

```bash
deno run \
  --allow-net=0.0.0.0:8000,api.stripe.com:443,db.internal:5432 \
  --allow-env=PORT,DATABASE_URL,STRIPE_KEY \
  --allow-read=/srv/myapp/data \
  --no-prompt \
  server.ts
```

`--no-prompt` matters — without it, a permission check at runtime will block waiting for stdin input the supervisor can't provide.

## Supervision with systemd

A working unit file:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Deno API
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/myapp
Environment=PORT=8000
EnvironmentFile=/srv/myapp/.env
ExecStart=/home/deploy/.deno/bin/deno run \
  --allow-net --allow-env --allow-read=/srv/myapp \
  --no-prompt server.ts
Restart=always
RestartSec=2
TimeoutStopSec=15
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

`KillSignal=SIGTERM` and `TimeoutStopSec=15` are the lines that make graceful shutdown work. Without them, systemd sends `SIGKILL` after 90 seconds — long enough that you won't notice in testing, short enough to truncate slow requests in production.

## Supervision with a Process Manager

If you're running more than one app, a process manager is easier to maintain. [Oxmgr](https://oxmgr.empellio.com) handles Deno without any special configuration:

```toml
# oxfile.toml
[processes.api]
command = "deno run --allow-net --allow-env --allow-read=/srv/myapp --no-prompt server.ts"
cwd = "/srv/myapp"
env_file = ".env"
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "15s"

[processes.api.health]
type = "http"
url = "http://127.0.0.1:8000/health"
interval = "10s"

[processes.api.limits]
memory = "256M"
```

The advantage of putting it in `oxfile.toml` over a systemd unit is that the same config can describe a worker, a cron job, and the API — all in one file you commit to git.

## Reverse Proxy and TLS

Don't expose Deno on port 443 directly. Put a reverse proxy in front and let it handle TLS, gzip, and request logging.

Caddy is the lowest-effort option:

```caddyfile
api.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

That's the whole config. Caddy fetches a Let's Encrypt cert automatically. nginx works too — the [Node.js VPS setup with nginx and SSL guide](/blog/nodejs-vps-setup-nginx-ssl) has a complete config you can swap the upstream port into.

## Dependency Caching

Deno caches remote imports under `$DENO_DIR` (default `~/.cache/deno`). On first run, every import is fetched; subsequent runs are instant. For deterministic production:

```bash
deno cache server.ts
```

Run this as part of your deploy step — before the supervisor starts the new version. That way the first request after a deploy doesn't pay the import-fetch tax.

For lockfile discipline, use `deno.lock`. Commit it. Pass `--lock=deno.lock --frozen` in production so a network blip doesn't silently upgrade a dependency.

## Logs

Deno writes to stdout and stderr. Capture them at the supervisor level — don't try to write to a file from inside the app. Let logrotate or your process manager handle rotation. The patterns from the [Node.js log management guide](/blog/nodejs-log-management) translate one-for-one.

## Restarts and Crash Loops

Deno's V8 underpinnings mean it can panic on the same kinds of bugs that crash Node: out-of-memory, segfault in a native module, unhandled rejection if you've opted into strict mode. Your supervisor needs to distinguish "deserves a restart" from "deserves to stay dead":

- **Restart on:** non-zero exit due to runtime errors, OOM kills, network timeouts during startup.
- **Don't restart on:** repeated immediate exits (likely a config bug — keep restarting and you DDoS yourself).

systemd's `StartLimitBurst` and Oxmgr's `max_restarts` solve this. Pick something like "10 restarts in 60 seconds, then stop and alert."

For the deeper version of this debugging conversation, the [Node.js app keeps crashing](/blog/nodejs-app-keeps-crashing) post applies to Deno almost word-for-word.

## What You Lose vs Deno Deploy

Being honest about the trade-off:

- **No edge network.** Your users in Sydney hit your Frankfurt VPS over the open internet.
- **You patch the OS.** Security updates are your job.
- **No magic scaling.** If you get hugged-to-death by Hacker News, you scale vertically or set up a second box behind a load balancer yourself.

What you gain: predictable costs, full filesystem and network access, no execution time caps, and the ability to run anything alongside Deno on the same machine (cron, a database, a worker queue).

## A Realistic Deploy Loop

1. Git push to a `main` branch.
2. A webhook on the VPS pulls and runs `deno cache server.ts`.
3. Reload the supervisor (`systemctl reload myapp` or `oxm reload api`).
4. The supervisor sends `SIGTERM`, waits for drain, starts the new version.

The full webhook pattern is documented in the [git webhook auto-deploy guide](/blog/git-webhook-auto-deploy-nodejs) — replace `node` with `deno` and the steps are identical.

## Bottom Line

Self-hosted Deno is Node-like in shape but lighter in dependencies. The runtime is a single binary, the permission model gives you a real security boundary, and the same supervision tools you'd use for any other long-running process apply directly.

If you want a process manager that doesn't drag Node along just to babysit Deno, [Oxmgr](https://oxmgr.empellio.com) installs in under a minute and runs on the same VPS as your app with no JavaScript runtime of its own.
