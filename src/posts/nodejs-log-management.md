---
title: Node.js Log Management in Production — Rotation, Structured Logging, and Search
description: Production Node.js apps generate thousands of log lines per minute. Learn how to structure logs, rotate files, aggregate across instances, and actually find what you're looking for when something goes wrong.
date: 2026-03-27
tags: [node.js, logging, production, devops, monitoring]
keywords: [node.js logging production, node.js log management, node.js log rotation, structured logging node.js, node.js logs, pm2 logs, pino logger node.js, winston node.js, node.js log aggregation, json logging node.js]
author: Oxmgr Team
---

# Node.js Log Management in Production

Logs are your post-mortem. When something breaks at 2am, logs are the difference between "I know exactly what happened" and "I have no idea."

Most apps start with `console.log`. That's fine for development. In production, you need structured logs, rotation, aggregation across instances, and searchability. Here's how to build that.

## Why `console.log` Isn't Enough

`console.log` has four problems in production:

**No structure.** Free-text logs are hard to query. Finding "all 500 errors from the payments endpoint in the last hour" in plain text requires brittle grep patterns.

**No log levels.** You can't tell debug noise from critical errors without parsing the message string.

**Synchronous I/O.** `console.log` is synchronous in Node.js — it blocks the event loop until the write completes. Under high load, this adds measurable latency.

**No rotation.** Stdout goes somewhere (wherever your process manager pipes it), but there's no built-in rotation. Logs can grow to fill your disk.

## Use a Proper Logger

Two good options: **Pino** (fastest) and **Winston** (most flexible).

### Pino — Recommended

Pino serializes JSON logs at native speed — benchmarks show it's 5–10× faster than Winston and orders of magnitude faster than `console.log` under load.

```bash
npm install pino pino-pretty
```

```javascript
import pino from 'pino';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',

  // In development: pretty-print. In production: raw JSON.
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

export default log;
```

Use it instead of `console.log`:

```javascript
import log from './logger.js';

// Structured fields, not string interpolation
log.info({ userId: 123, action: 'login' }, 'User logged in');
log.error({ err, requestId: req.id }, 'Payment processing failed');
log.warn({ memoryMB: 450 }, 'Memory approaching limit');
```

Production output (raw JSON, one object per line):

```json
{"level":30,"time":1741824000000,"pid":12847,"userId":123,"action":"login","msg":"User logged in"}
{"level":50,"time":1741824001000,"pid":12847,"err":{"type":"Error","message":"Connection refused"},"requestId":"req-abc123","msg":"Payment processing failed"}
```

This is machine-readable. You can pipe it to `jq`, aggregate it in Elasticsearch, or filter it in Loki without writing parsers.

### Adding Request Context

Every log line should include enough context to trace a request end-to-end. Use `AsyncLocalStorage`:

```javascript
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino from 'pino';

const asyncStorage = new AsyncLocalStorage();
const baseLogger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Create a child logger with request context
export const log = new Proxy(baseLogger, {
  get(target, prop) {
    const store = asyncStorage.getStore();
    if (store && typeof target[prop] === 'function') {
      return target.child(store)[prop].bind(target.child(store));
    }
    return target[prop];
  }
});

// Middleware to set request context
export const requestContext = (req, res, next) => {
  const context = {
    requestId: req.headers['x-request-id'] ?? randomUUID(),
    method: req.method,
    path: req.path,
  };

  // Propagate request ID downstream
  res.setHeader('x-request-id', context.requestId);

  asyncStorage.run(context, next);
};
```

```javascript
// app.js
app.use(requestContext);

app.get('/orders/:id', async (req, res) => {
  log.info('Fetching order');               // includes requestId, method, path automatically
  const order = await db.getOrder(req.params.id);
  log.info({ orderId: order.id }, 'Order found');
  res.json(order);
});
```

Every log line from that request automatically includes `requestId`, `method`, `path` — without passing the logger around.

## Log Levels in Practice

Use levels consistently across your team:

| Level | When to use | Example |
|-------|-------------|---------|
| `fatal` | App is about to crash | Unrecoverable DB connection failure |
| `error` | Request failed, needs attention | Unhandled exception, 500 response |
| `warn` | Degraded behavior, doesn't need immediate action | High memory, slow query, deprecated usage |
| `info` | Normal significant events | Server started, user logged in, payment processed |
| `debug` | Detailed internal state for debugging | SQL queries, cache hits/misses |
| `trace` | Very verbose, usually only in development | Every function call, request/response bodies |

Set `LOG_LEVEL=debug` in `.env.development` and `LOG_LEVEL=info` in production. Debug noise doesn't go to production logs.

```javascript
// Only runs if level is debug or lower
log.debug({ query, params }, 'Executing query');

// Always runs (in production too)
log.info({ userId, action: 'purchase' }, 'Order placed');
```

## Log Rotation

Without rotation, logs fill your disk. On a moderately trafficked app, that can take days.

**Option 1: Process manager handles rotation**

Oxmgr rotates logs automatically. Configure in `oxfile.toml`:

```toml
[logging]
max_size_mb = 100     # rotate when file reaches 100MB
max_files = 7         # keep 7 rotated files (7 days at ~100MB/day)
compress = true       # gzip rotated files
```

**Option 2: `logrotate` (Linux system tool)**

```bash
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 nodeapp nodeapp
    postrotate
        oxmgr reload api   # reopen log file handles after rotation
    endscript
}
```

**Option 3: In-process rotation with `pino-roll`**

```bash
npm install pino-roll
```

```javascript
import pino from 'pino';
import pinoRoll from 'pino-roll';

const transport = await pinoRoll({
  file: '/var/log/myapp/app.log',
  frequency: 'daily',   // daily rotation
  limit: { count: 14 }, // keep 14 files
  mkdir: true,
});

const log = pino(transport);
```

## Structured Error Logging

Never log just an error message. Log the full error with context:

```javascript
// Bad — loses stack trace and context
catch (err) {
  log.error(`Failed to process payment: ${err.message}`);
}

// Good — structured, searchable, full context
catch (err) {
  log.error({
    err,                          // Pino serializes Error objects properly
    userId: req.user.id,
    orderId: req.body.orderId,
    amount: req.body.amount,
  }, 'Payment processing failed');
}
```

Pino serializes `err` to include `message`, `stack`, `type`, and any custom properties.

## Log Aggregation Across Instances

When you run 4 instances, logs go to 4 separate files. You need to aggregate them for searching. (Not sure why you'd run 4 instances? The [Node.js Clustering guide](/blog/nodejs-clustering-multi-core) explains multi-core setups.)

**Simple: pipe to stdout and collect with the process manager**

Oxmgr collects stdout/stderr from all instances into a single log stream, tagged with the instance ID:

```bash
oxmgr logs api --follow
# Shows: [api:0] {"msg":"Request handled"}
#        [api:1] {"msg":"Request handled"}
#        [api:0] {"msg":"Error occurred"}
```

**Scalable: ship to a log aggregation service**

For production with multiple servers, ship logs to a central store:

```bash
# Ship with Vector (recommended — fast, Rust-based)
# /etc/vector/vector.yaml
sources:
  app_logs:
    type: file
    include: ["/var/log/myapp/*.log"]
    read_from: beginning

transforms:
  parse_json:
    type: remap
    inputs: [app_logs]
    source: |
      . = parse_json!(.message)

sinks:
  loki:
    type: loki
    inputs: [parse_json]
    endpoint: http://loki:3100
    labels:
      app: myapp
      env: production
```

Common destinations:
- **Loki + Grafana** — open source, cheap, good for structured JSON logs
- **Elasticsearch + Kibana** — powerful querying, more expensive to operate
- **Datadog / Logtail / Axiom** — managed, easier setup, costs money

## Querying Logs

With JSON structured logs in Loki, you can query with LogQL:

```logql
# All errors in the last hour
{app="myapp"} | json | level="error"

# Slow requests (>1000ms)
{app="myapp"} | json | duration > 1000

# Payment failures for a specific user
{app="myapp"} | json | userId="123" | action="payment" | level="error"

# Error rate over time
rate({app="myapp"} | json | level="error" [5m])
```

This is the "find all 500 errors from the payments endpoint in the last hour" that's impossible with plain text logs.

## What to Log (and What Not to)

**Log:**
- All requests (method, path, status, duration)
- All errors with full context
- Business events (user registered, payment processed, order shipped)
- Slow queries (>100ms database calls)
- Resource warnings (memory approaching limit, connection pool near capacity)

**Don't log:**
- Passwords, tokens, API keys — ever
- PII (email, phone, credit card numbers) without compliance review
- Full request/response bodies (too large, security risk)
- Debug noise in production (control with log level)

## Request Logging Middleware

```javascript
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path, query } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    log[level]({
      method,
      path,
      query: Object.keys(query).length ? query : undefined,
      status: res.statusCode,
      durationMs: duration,
      contentLength: res.getHeader('content-length'),
    }, 'Request handled');
  });

  next();
});
```

Output:

```json
{"level":30,"time":1741824000123,"method":"GET","path":"/api/orders","status":200,"durationMs":45,"msg":"Request handled"}
{"level":40,"time":1741824001456,"method":"POST","path":"/api/payments","status":422,"durationMs":12,"msg":"Request handled"}
```

## Summary

Production log management requires:

1. **Structured JSON logging** (Pino is the best choice for Node.js)
2. **Log levels** used consistently — debug off in production
3. **Request context** on every line (use `AsyncLocalStorage`)
4. **Log rotation** — don't fill your disk
5. **Aggregation** across instances (process manager or log shipper)
6. **Searchability** — JSON + Loki/Elasticsearch makes queries trivial

The 10 minutes it takes to set this up is nothing compared to the hours you'd spend debugging a production incident without good logs.

See the [Oxmgr docs](/docs) for log configuration, or the [health check guide](/blog/nodejs-health-checks) for what to monitor alongside logs.
