---
title: SQLite in Production — The Quiet Revolution for Small and Medium Apps
description: SQLite has been "not for production" by reputation and brilliant for production in practice. Here's when it's the right choice, how to deploy it, and what changes in your supervisor setup.
date: 2026-05-30
tags: [sqlite, database, production, self-hosting, devops]
keywords: [sqlite in production, sqlite production ready, sqlite vs postgres, sqlite backup production, litestream, sqlite wal mode, sqlite nodejs production, sqlite small apps]
author: Oxmgr Team
---

# SQLite in Production

For a long time, "SQLite is for embedded use" was just received wisdom. Then Litestream proved continuous replication was solvable. Then `better-sqlite3` made it 5x faster than the standard Postgres driver for typical web workloads. Then Tailscale, Pieter Levels' empire, and a few high-profile blog posts later — SQLite became a real choice for production web apps.

This post is when it's the right call, when it isn't, and what changes in your deploy and supervision setup if you go this route.

## The Case for SQLite

A typical web app does mostly small, indexed queries with low concurrency. For that workload SQLite is:

- **Faster on reads** than networked databases by 10-50x — there's no round trip, no serialization. The DB is a function call away.
- **Simpler to operate** — no separate server process, no config tuning, no `pg_hba.conf`.
- **Cheaper** — your DB is a file on the same disk as your app. No managed DB fees.
- **Crash-safe** — WAL mode and proper `fsync` make SQLite as durable as Postgres for most failure modes.

The "real database" objection is mostly an artifact of when SQLite couldn't handle WAL-mode concurrency well. That was fixed years ago.

## When SQLite Is the Wrong Choice

Real limits, not folklore:

- **Multiple write-heavy processes.** SQLite serializes writes. If you have 10 worker processes all writing constantly, you'll see lock contention. A queue worker that processes 100 jobs/sec writing to SQLite is fine; 10,000 jobs/sec is not.
- **You need horizontal scaling.** SQLite lives on one machine. The moment you need two app servers writing to the same database, you're out of SQLite territory — or you're in LiteFS territory, which is a more involved conversation.
- **You need complex query planning.** SQLite's optimizer is good for indexed lookups and simple joins. For 20-table joins with window functions and CTEs over millions of rows, Postgres or DuckDB will outperform it dramatically.
- **You need row-level security or extensive permissions.** SQLite has no users. Auth is your app's job.

For everything else — most CRUD apps, most internal tools, most B2B SaaS at small-to-medium scale — SQLite is genuinely a good answer.

## The Production Setup

Three things you need on top of "open a SQLite database":

### 1. WAL Mode

Enable Write-Ahead Logging on first connection:

```js
import Database from 'better-sqlite3';

const db = new Database('app.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
```

What each does:

- **`journal_mode = WAL`** — readers don't block writers and vice versa. Required for any concurrent workload.
- **`synchronous = NORMAL`** — faster than `FULL`, still safe from corruption (you might lose the last fsync on power loss, but you won't corrupt the DB).
- **`foreign_keys = ON`** — off by default for backward compat, basically always wanted.
- **`busy_timeout = 5000`** — if a write is blocked, wait up to 5 seconds before erroring.

These four pragmas are the difference between "SQLite is weird in production" and "SQLite is fine."

### 2. Backups (Real Ones)

The naïve answer is `cp app.db backup.db`. The correct answer is `litestream`, which streams every WAL frame to S3 (or any compatible store) in near-real-time.

Install:

```bash
curl -LsS https://github.com/benbjohnson/litestream/releases/latest/download/litestream-v0.3.13-linux-amd64.tar.gz | sudo tar -xz -C /usr/local/bin
```

Config (`/etc/litestream.yml`):

```yaml
dbs:
  - path: /srv/myapp/app.db
    replicas:
      - type: s3
        bucket: my-app-backups
        path: app.db
        region: eu-central-1
```

Run it as a separate supervised process. With [Oxmgr](https://oxmgr.empellio.com):

```toml
[processes.api]
command = "node dist/server.js"
restart = "on-failure"

[processes.litestream]
command = "/usr/local/bin/litestream replicate -config /etc/litestream.yml"
restart = "always"
```

If your VPS dies, restore is `litestream restore -o app.db s3://my-app-backups/app.db`. Point-in-time recovery to any second. This is the part that makes SQLite actually production-ready.

### 3. A Single-Writer Architecture

SQLite is happy with many concurrent readers. Writers serialize. The cleanest architecture:

- **One writer process** does all the writes.
- **N reader processes** do everything else.

For most web apps, "one writer" just means "one Node process talking to SQLite." If you've been considering clustering (see [Node.js clustering for multi-core servers](/blog/nodejs-clustering-multi-core)) — you may not need it. A single Node process with `better-sqlite3` can serve thousands of requests per second.

If you do need multi-process for CPU work, route writes through a queue and let one worker drain it. Or accept that writes from multiple processes work fine in practice, with occasional `SQLITE_BUSY` retries, as long as you have `busy_timeout` set.

## Supervisor Setup

A complete `oxfile.toml` for a SQLite-backed app:

```toml
[processes.api]
command = "node dist/server.js"
cwd = "/srv/myapp"
env = { DATABASE_URL = "file:./app.db", PORT = "3000" }
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "15s"

[processes.api.health]
type = "http"
url = "http://127.0.0.1:3000/health"
interval = "10s"

[processes.api.limits]
memory = "512M"

[processes.litestream]
command = "/usr/local/bin/litestream replicate -config /etc/litestream.yml"
restart = "always"
```

That's the whole production stack: app + backup replication. No Postgres process, no `pg_hba.conf`, no managed DB bill.

## Graceful Shutdown — The DB-Close Bit

On `SIGTERM`, the app should close the database explicitly:

```js
const shutdown = async () => {
  console.log('draining...');
  await server.close();
  db.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
```

Not closing isn't catastrophic — SQLite's WAL mode is crash-safe — but a clean close ensures the WAL is checkpointed and the next start is faster. The general pattern is in the [graceful shutdown guide](/blog/nodejs-graceful-shutdown-complete-guide).

## Schema Migrations

The same tools work: Prisma, Drizzle, Knex, Kysely. SQLite's `ALTER TABLE` is more limited than Postgres (no `DROP COLUMN` until 3.35, no easy renames before that), so prefer additive migrations and let `DROP COLUMN` happen in the migration tool's recreate-and-copy mode if needed.

The migration step belongs *before* the supervisor reloads the app:

```bash
node migrate.js
oxm reload api
```

Run migrations from a script the deploy hook calls. Don't run them on app startup — every replica will race and one will lose.

## Performance Tuning Worth Knowing

Beyond the four pragmas above:

```js
db.pragma('cache_size = -64000');  // 64 MB of page cache
db.pragma('mmap_size = 268435456'); // 256 MB memory-mapped I/O
db.pragma('temp_store = memory');
```

These help with read performance for working sets that fit in memory. Default cache is 2 MB, which is too small for any real app.

For write-heavy workloads, batch with transactions:

```js
const insert = db.prepare('INSERT INTO events (data) VALUES (?)');
const insertMany = db.transaction((events) => {
  for (const event of events) insert.run(event);
});

insertMany(myThousandEvents);
```

A single transaction is one fsync. Without batching, you fsync per row. The difference is 100x.

## Where SQLite Quietly Wins

Real-world wins I've seen:

- **Internal tools** that would never be worth a managed DB. SQLite + Litestream costs $0.50/month in S3 storage.
- **Read-heavy SaaS** where the working set is small enough to fit in cache. SQLite serves them at sub-millisecond latency.
- **Single-tenant deployments** — each customer gets their own SQLite file. No multi-tenancy SQL gymnastics.
- **Side projects** that turned out not to need scaling and saved $50/month on RDS for years.
- **Edge or remote deployments** where managing a separate DB process is operational overhead.

## Where the SQLite Discourse Gets Annoying

A few things to push back on:

- **"Use SQLite for everything."** No. It has real limits.
- **"WAL fixed all concurrency issues."** It fixed most. Heavy concurrent writers still serialize.
- **"Litestream is a complete HA solution."** It's a complete backup solution. HA across regions requires LiteFS or rqlite or sticking with Postgres.

Use it for what it's good at. Reach for Postgres when you have one of the legitimate reasons above.

## Bottom Line

SQLite in production is not exotic anymore. WAL mode + Litestream + a real supervisor turns it into a serious database for small-to-medium apps. The operational simplification is real — one fewer process, one fewer port, one fewer thing to back up.

If you want a supervisor that runs your app, your Litestream replicator, and any scheduled jobs from one config file, [Oxmgr](https://oxmgr.empellio.com) installs in under a minute and stays out of your way.
