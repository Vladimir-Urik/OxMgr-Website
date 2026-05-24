---
title: NestJS in Production — Build, Deploy, and Keep It Running
description: NestJS gives you structure; production gives you scars. Here's the full deployment story for a NestJS app, from build artifact to supervised process to graceful shutdown.
date: 2026-06-15
tags: [nestjs, node.js, production, deployment, process-manager]
keywords: [nestjs production deployment, nestjs pm2, nestjs process manager, deploy nestjs to vps, nestjs graceful shutdown, nestjs production build, nestjs server, nestjs systemd]
author: Oxmgr Team
---

# NestJS in Production

NestJS gives you a framework that looks like Spring or .NET Core. It also gives you a Node process at the end — and that process has the same operational concerns as any other long-running JavaScript server. This post is about the part NestJS docs touch lightly: getting from `nest build` to a process that's still alive next Tuesday.

## The Build Artifact

`nest build` produces JavaScript in `dist/`. That's what runs in production. You do not ship `src/`, you do not ship TypeScript, and you don't need `@nestjs/cli` on the server.

A clean production install:

```bash
# in CI or on a build box
npm ci
npm run build
npm prune --production
```

Now ship `dist/`, `node_modules/`, `package.json`, and any static assets. That's the deploy artifact.

If you're using a monorepo (Nx, Turborepo), the artifact selection is more involved — see the [monorepo deployment patterns post](/blog/monorepo-deployment-patterns) for the full pattern.

## Starting It

The standard entrypoint:

```bash
node dist/main.js
```

Don't use `nest start --prod`. That command wraps `node` but adds CLI overhead and an extra layer of indirection between your supervisor and the actual process. Going direct gives you cleaner exit codes and signal handling.

## Supervision

NestJS is a Node process. Pick a supervisor: systemd, PM2, or [Oxmgr](https://oxmgr.empellio.com). The choice doesn't change Nest; it changes how easy your life is.

Oxmgr config for a typical NestJS API:

```toml
# oxfile.toml
[processes.api]
command = "node dist/main.js"
cwd = "/srv/myapi"
env_file = ".env"
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "25s"

[processes.api.health]
type = "http"
url = "http://127.0.0.1:3000/health"
interval = "10s"

[processes.api.limits]
memory = "640M"
```

The `stop_timeout` of 25 seconds is intentionally generous. NestJS apps often have multiple modules with cleanup hooks — database pools, message queue connections, scheduled jobs — and they all need a chance to close cleanly.

## Graceful Shutdown — The NestJS Specifics

NestJS has first-class graceful shutdown support. Enable it explicitly:

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000, '127.0.0.1');
}
bootstrap();
```

`enableShutdownHooks()` is what makes your providers' `OnModuleDestroy` and `OnApplicationShutdown` lifecycle methods fire when the process receives `SIGTERM`. Without it, those methods silently don't run and your DB connections leak on every deploy.

A typical provider:

```ts
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  constructor(private readonly pool: Pool) {}

  async onApplicationShutdown(signal?: string) {
    await this.pool.end();
  }
}
```

Test this locally by running your app and sending it `SIGTERM`:

```bash
kill -TERM <pid>
```

If you don't see your shutdown logs fire within a couple of seconds, something is misconfigured.

The broader pattern is in the [graceful shutdown guide](/blog/nodejs-graceful-shutdown-complete-guide).

## Health Endpoint

NestJS ships a Terminus module specifically for this:

```bash
npm install @nestjs/terminus
```

```ts
// health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
    ]);
  }
}
```

Two endpoints worth exposing:

- `/health` — liveness. "Is the process responsive?" Cheap, no DB check.
- `/ready` — readiness. "Is the app actually able to serve traffic?" Includes DB and external dependency checks.

Your supervisor watches `/health`. Your load balancer (if any) watches `/ready`. The full reasoning is in the [health checks guide](/blog/nodejs-health-checks).

## Environment Configuration

Nest's `ConfigModule` is the standard pattern:

```ts
ConfigModule.forRoot({
  envFilePath: '.env',
  isGlobal: true,
  validationSchema: Joi.object({
    DATABASE_URL: Joi.string().required(),
    PORT: Joi.number().default(3000),
    NODE_ENV: Joi.string().valid('development', 'production').required(),
  }),
}),
```

The validation schema is non-optional in production. Without it, a missing env var becomes a `undefined` that you discover three deploys later when a feature flag turns it on.

Pair this with a supervisor-managed `env_file` so secrets live outside your repo and outside your container images. The [env vars post](/blog/nodejs-environment-variables-production) covers the full pattern.

## Database Connection Pools

The default `typeorm` or `prisma` pool size is often too small (or worse, too large) for production. Two rules of thumb:

- Pool size per process ≤ database max connections / number of processes.
- Don't share a pool between processes — each Node process gets its own.

If you're running NestJS in cluster mode (more on this below), every worker gets its own pool. A 5-worker cluster with `pool_size=10` is 50 connections per box. Check `pg_stat_activity` or `SHOW PROCESSLIST` to confirm.

## Clustering

NestJS doesn't have a built-in cluster mode — you use Node's `cluster` module or run multiple processes behind a load balancer. For most apps, the second is cleaner.

With Oxmgr you can run N instances by templating:

```toml
[processes.api]
command = "node dist/main.js"
instances = 4
port_offset = 1
env = { PORT = "3000" }
```

This spawns ports 3000, 3001, 3002, 3003. A reverse proxy (Caddy with `lb_policy round_robin`, nginx with `upstream`) balances across them.

For deciding when to cluster, see [Node.js clustering for multi-core servers](/blog/nodejs-clustering-multi-core).

## Logging

NestJS's default logger is fine for development. In production, replace it with `pino` or `winston` for structured JSON output:

```ts
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // ...
}
```

Then let your supervisor handle stdout capture and rotation. Don't write to files from inside Nest — you'll fight with the supervisor over who owns the FDs. The [log management guide](/blog/nodejs-log-management) covers the rotation policy.

## Build-Once, Deploy-Anywhere

A Nest deploy artifact should be reproducible. The "build on the server" anti-pattern means every deploy has a chance of pulling a different transitive dep. Either build in CI and ship the artifact, or build on a designated build box and rsync the result.

The deploy itself is rsync + supervisor reload:

```bash
rsync -az --delete dist/ deploy@vps:/srv/myapi.new/dist/
rsync -az node_modules/ deploy@vps:/srv/myapi.new/node_modules/
ssh deploy@vps 'mv /srv/myapi /srv/myapi.old && mv /srv/myapi.new /srv/myapi && oxm reload api'
```

For automated webhook deploys, see [git webhook auto-deploy](/blog/git-webhook-auto-deploy-nodejs).

## Common Pitfalls

- **Forgetting `enableShutdownHooks()`.** Silent connection leaks on every deploy.
- **Running with `nest start` in production.** Adds an unnecessary CLI wrapper between supervisor and process.
- **No env validation.** Missing vars become `undefined`, which becomes a `NaN`, which becomes a Sentry alert at 4 AM.
- **Pool sizes copied from tutorials.** A pool of 100 per process on a single CPU is worse than a pool of 10.
- **Sync interceptors on hot paths.** They block the event loop. Always async.

## Bottom Line

NestJS deserves a supervisor that takes lifecycle seriously — because NestJS itself takes lifecycle seriously. Wire `enableShutdownHooks()` correctly, expose `/health` and `/ready`, set a memory cap on the supervisor side, and your Nest app will run for months without intervention.

[Oxmgr](https://oxmgr.empellio.com) treats every Node app the same: small footprint, fast restart, no JavaScript runtime of its own. For NestJS specifically, the combination of `stop_timeout = "25s"` and a clean health endpoint covers 95% of what you'd otherwise build by hand.
