---
title: Node.js Production Best Practices Checklist 2026
description: A comprehensive checklist of Node.js production best practices — covering process management, error handling, logging, security, performance, and deployment. 30+ actionable items.
date: 2026-03-31
tags: [node.js, production, best-practices, checklist, devops, security]
keywords: [node.js production best practices, node.js production checklist, node.js production tips 2026, node.js deployment best practices, node.js security production, node.js performance production, node.js production guide, nodejs best practices]
author: Oxmgr Team
---

# Node.js Production Best Practices Checklist 2026

A checklist you can actually use — not a list of vague advice, but specific things to verify before you ship.

Mark these off before going to production. Revisit quarterly.

---

## Process Management

- [ ] **Use a process manager.** Never run `node server.js` directly. Use Oxmgr, PM2, or systemd. A bare process dies on crash and stays dead. See [What Is a Process Manager?](/blog/what-is-a-process-manager) if you're starting from scratch.

- [ ] **Run multiple instances.** One process per CPU core. Use `instances = "max"` in `oxfile.toml` or `-i max` in PM2. You're leaving performance on the table with a single instance. The [Node.js Clustering guide](/blog/nodejs-clustering-multi-core) covers the tradeoffs in detail.

- [ ] **Set memory limits.** Configure `max_memory_mb` so your process manager restarts the process before the OS OOM killer does. OOM kills leave no logs; clean restarts do.

  ```toml
  [processes.api.resource_limits]
  max_memory_mb = 512
  ```

- [ ] **Configure boot persistence.** Your app should start automatically on server reboot. Use `systemctl enable` or `pm2 startup`. Test by rebooting and checking if your app is running.

- [ ] **Set `max_restarts` with a window.** Prevent infinite crash loops. If the app crashes 10 times in 60 seconds, something is seriously wrong — stop and alert rather than spin.

  ```toml
  max_restarts = 10
  restart_window_secs = 60
  ```

- [ ] **Use health checks.** Configure HTTP health check polling. Without it, your process manager doesn't know if the app is accepting connections or just running as a zombie.

---

## Error Handling

- [ ] **Handle `uncaughtException`.** Unhandled synchronous exceptions crash the process without logging anything useful. Add a handler that logs and exits cleanly.

  ```javascript
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
  ```

- [ ] **Handle `unhandledRejection`.** In Node.js 15+, unhandled promise rejections crash the process. Add a global handler.

  ```javascript
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    // Don't exit — let the process continue serving other requests
    // But DO fix the root cause
  });
  ```

- [ ] **Handle `SIGTERM` for graceful shutdown.** Finish in-flight requests before exiting. A process killed mid-request drops that request on the floor.

  ```javascript
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
  ```

- [ ] **Add retry logic for external dependencies.** Database connections, Redis, external APIs — wrap startup connections in retry loops with exponential backoff. Cold start with a temporarily unavailable dependency should retry, not crash.

- [ ] **Set timeouts on all external calls.** An API call that hangs forever will tie up your event loop. Set explicit timeouts.

  ```javascript
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  ```

---

## Environment & Configuration

- [ ] **Use environment variables for all config.** No hardcoded URLs, credentials, or environment-specific values in code. Everything that changes between environments goes in `.env`.

- [ ] **Validate environment variables at startup.** Fail fast with a clear error if required variables are missing. Don't let the app start and fail mysteriously later.

  ```javascript
  const required = ['DATABASE_URL', 'JWT_SECRET', 'REDIS_URL'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  ```

- [ ] **Never commit `.env` files.** Add `.env*` to `.gitignore`. Use `.env.example` with dummy values as documentation. Real secrets live on the server only.

- [ ] **Set `NODE_ENV=production`.** Many libraries (Express, React, etc.) behave differently — disabling development middleware, enabling caching, reducing debug output.

- [ ] **Use `npm ci` in deploy scripts, not `npm install`.** `npm ci` installs exact versions from `package-lock.json`. `npm install` can silently update packages.

---

## Logging

- [ ] **Use structured JSON logging.** Use Pino or Winston with JSON output. Plain text logs can't be queried.

- [ ] **Set `LOG_LEVEL=info` in production.** Debug logs generate noise and can expose sensitive data. Use `warn` or `error` if you need to reduce log volume.

- [ ] **Never log passwords, tokens, or PII.** Audit your log statements. Request bodies, authorization headers, and user data shouldn't appear in logs.

- [ ] **Configure log rotation.** Logs grow forever if not rotated. Set size limits and max file counts in your process manager or via `logrotate`.

- [ ] **Include request IDs in every log line.** Use `AsyncLocalStorage` to propagate a request ID through all logs generated during a request. Critical for debugging.

---

## Security

- [ ] **Run as a non-root user.** Create a dedicated user for your app. Never run Node.js as root — a compromised process would have full system access.

  ```bash
  adduser --system --group nodeapp
  sudo -u nodeapp node server.js
  ```

- [ ] **Set `--max-old-space-size` explicitly.** Without it, Node.js uses a default heap size that may not match your server's RAM. Set it to ~75% of available memory minus OS overhead.

  ```toml
  command = "node --max-old-space-size=1536 dist/server.js"
  ```

- [ ] **Use a reverse proxy (Nginx) in front of Node.** Don't expose Node.js directly on port 80/443. Nginx handles TLS termination, request buffering, and static file serving more efficiently.

- [ ] **Set security headers.** Use `helmet` for Express. At minimum: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`.

  ```bash
  npm install helmet
  ```

  ```javascript
  import helmet from 'helmet';
  app.use(helmet());
  ```

- [ ] **Rate limit your API.** Protect against brute force and abuse.

  ```bash
  npm install express-rate-limit
  ```

  ```javascript
  import rateLimit from 'express-rate-limit';
  app.use('/api', rateLimit({ windowMs: 60_000, max: 100 }));
  ```

- [ ] **Keep Node.js updated.** Run LTS releases. Check `node --version` against the current LTS on nodejs.org. Security patches land in point releases.

---

## Performance

- [ ] **Enable HTTP keep-alive.** Persistent connections avoid TCP handshake overhead on repeated requests.

  ```javascript
  const server = app.listen(3000);
  server.keepAliveTimeout = 65_000;   // slightly more than AWS ALB's 60s
  server.headersTimeout = 66_000;
  ```

- [ ] **Use `--enable-source-maps` in production.** Stack traces from transpiled/bundled code are useless without source maps.

  ```toml
  command = "node --enable-source-maps dist/server.js"
  ```

- [ ] **Set `ulimit -n` high enough.** Each HTTP connection is a file descriptor. The default limit (1024) is too low for any production load.

  ```toml
  # oxfile.toml
  [processes.api.resource_limits]
  max_open_files = 65536
  ```

- [ ] **Use connection pooling for databases.** Never create a new connection per request. Use `pg-pool`, `mongoose` connection pool, `mysql2` pool, etc.

- [ ] **Compress responses.** Use `compression` middleware for Express or configure Nginx-level gzip. Can reduce bandwidth by 60–80% for JSON APIs.

---

## Deployment

- [ ] **Use zero-downtime rolling restarts.** `oxmgr reload` / `pm2 reload` — not `restart`. Test that in-flight requests complete during deploys. See the [Zero-Downtime Deployment guide](/blog/zero-downtime-deployment) for the complete setup.

- [ ] **Health check your deploy.** After deploying, poll `/health` until it returns 200 before declaring success. A deploy script that exits 0 without verifying health is dangerous.

- [ ] **Pin Node.js version.** Use `.nvmrc` or `.node-version` in your repo. Everyone (CI, production, devs) uses the same version.

  ```bash
  node --version > .nvmrc
  ```

- [ ] **Use a staging environment.** Deploys to staging before production. Even a simple `NODE_ENV=staging` on a second server catches most issues.

- [ ] **Automate deploys.** A repeatable deploy script beats ad-hoc SSH sessions. Same script runs in CI and on the server.

---

## Monitoring

- [ ] **Set up uptime monitoring.** External pings to your health endpoint every 60 seconds from a service like Better Uptime, UptimeRobot, or self-hosted. Alerts before users notice.

- [ ] **Monitor memory trends.** An always-increasing heap is a memory leak. Set alerts on heap growth, not just absolute values.

- [ ] **Alert on restart count.** If your process manager restarts an instance more than N times per hour, something is wrong. This is an early warning before the crash loop starts.

  ```bash
  oxmgr status --json | jq '.processes[] | select(.restarts > 5)'
  ```

- [ ] **Track error rates, not just uptime.** Uptime monitors miss silent failures — 200 responses with empty bodies, 500s that don't crash the process, degraded features. Add error rate alerting.

---

## Quick Scoring

Count your checkmarks:

| Score | Assessment |
|-------|-----------|
| 30–35 ✓ | Production-ready |
| 20–29 ✓ | Good, a few gaps to close |
| 10–19 ✓ | Some basics missing — prioritize process management and error handling |
| 0–9 ✓ | Start with a process manager and graceful shutdown, everything else follows |

---

The single highest-leverage item if you're starting from zero: **install a process manager and configure crash recovery**. Everything else improves reliability at the margins; this is what keeps your app online.

Install Oxmgr and get started:

```bash
npm install -g oxmgr
```

See the [deployment guide](/blog/how-to-deploy-nodejs-production) for a step-by-step setup that covers most of this checklist.
