---
title: Shipping Logs to Loki and Grafana from Your Process Manager
description: Stream your process logs into Grafana Loki without a heavy agent — use the process manager's event bus (or its per-process log files) to push structured log:out and log:err lines into Loki.
date: 2026-09-15
tags: [loki, grafana, logging, observability, process-manager, devops]
keywords: [nodejs logs loki grafana, ship logs to loki, loki without promtail, process manager log shipping, structured logging loki, grafana loki self hosted]
author: Oxmgr Team
---

# Shipping Logs to Loki and Grafana from Your Process Manager

Grafana Loki is "Prometheus for logs" — cheap to run, indexed by labels, queryable next to your [metrics](/blog/prometheus-grafana-process-metrics) in the same Grafana. The usual way to feed it is Promtail or the Grafana Agent tailing files. But if you're already running a process manager with an [event bus](/blog/process-manager-event-bus), you have a nicer source: every stdout/stderr line is already a *structured event* with the process name attached. Let's ship those to Loki.

## Two ways in

You can feed Loki from either end of the process manager:

1. **From the event bus** — subscribe to `log:out` / `log:err` and push each line to Loki with the process name as a label. Real-time, structured, no file tailing.
2. **From the log files** — point Promtail/Alloy at the [per-process log files](/blog/nodejs-log-management) the manager writes. Standard, agent-based, survives the shipper restarting.

The event-bus route is lighter and gives you clean labels for free; the file route is more robust to the shipper being down (files persist). This post does the event-bus route, because it's the one unique to having a real event stream.

## The shipper

Loki's push API takes JSON streams labeled by key/value. This shipper subscribes to log events and batches them to Loki:

```js
// loki-shipper.js
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const LOKI = process.env.LOKI_URL ?? 'http://localhost:3100/loki/api/v1/push';
const SOCK = path.join(
  os.homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/oxmgr/events.sock'
    : '.local/share/oxmgr/events.sock'
);

let buffer = [];

function enqueue(e) {
  const name = e.process?.name ?? 'unknown';
  const stream = e.event === 'log:err' ? 'stderr' : 'stdout';
  const ns = String(Date.now() * 1e6);   // Loki wants nanosecond timestamps
  buffer.push({ name, stream, ns, line: e.line ?? '' });
}

async function flush() {
  if (!buffer.length) return;
  const batch = buffer; buffer = [];
  // group by (name, stream) label set
  const streams = {};
  for (const b of batch) {
    const key = `${b.name}|${b.stream}`;
    (streams[key] ??= { stream: { app: b.name, stream: b.stream }, values: [] })
      .values.push([b.ns, b.line]);
  }
  await fetch(LOKI, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ streams: Object.values(streams) }),
  }).catch((err) => { console.error('loki push failed', err); buffer.unshift(...batch); });
}

setInterval(flush, 1000);   // batch every second

function subscribe() {
  const c = net.connect(SOCK, () =>
    c.write(JSON.stringify({ subscribe: ['log:out', 'log:err'] }) + '\n')
  );
  readline.createInterface({ input: c }).on('line', (line) => enqueue(JSON.parse(line)));
  c.on('close', () => setTimeout(subscribe, 2000));
  c.on('error', () => {});
}
subscribe();
```

Batching every second keeps you well under Loki's rate limits while staying near-real-time. Each log line lands in Loki labeled `{app="api", stream="stderr"}`, so you can query by process and by stream.

## Supervise it

```toml
[processes.loki-shipper]
command = "node loki-shipper.js"
restart_on_exit = true
[processes.loki-shipper.env]
LOKI_URL = "http://localhost:3100/loki/api/v1/push"
```

## Querying in Grafana

Add Loki as a data source and use LogQL. A few queries that pay off immediately:

```logql
# All stderr across every process (where errors live)
{stream="stderr"}

# Just the api, filtered to errors
{app="api"} |= "ERROR"

# Rate of error lines per process — a spike = something's wrong
sum by (app) (rate({stream="stderr"} |= "Error" [5m]))
```

That last one is the log equivalent of a [restart-rate](/blog/prometheus-grafana-process-metrics) panel — a leading indicator you can alert on.

## Label discipline (the one Loki rule)

Loki indexes *labels*, not log content, and its performance depends on keeping label cardinality low. Good labels: `app`, `stream`, maybe `env` or `host`. **Bad** labels: request IDs, user IDs, timestamps — anything high-cardinality. Put those in the log *line* (query them with `|=` / `| json`), never in the label set. The shipper above deliberately uses only `app` and `stream` for exactly this reason.

## Structured logs make this shine

If your app logs JSON (see [structured logging](/blog/nodejs-log-management)), Loki can parse it at query time:

```logql
{app="api"} | json | level="error" | latency_ms > 500
```

Now you're querying fields, not grep-ing text. Emitting structured logs from the app plus this label-clean shipper gives you the searchable, per-process, real-time logging that people install expensive SaaS for — running next to your metrics in one self-hosted Grafana.

## Metrics + logs, one pane

Pair this with the [Prometheus exporter](/blog/prometheus-grafana-process-metrics) and both halves come from the same [event bus](/blog/process-manager-event-bus): metrics for *how much*, logs for *what happened*, correlated by the `app` label in a single Grafana. For the instant "this crashed right now" signal, keep the [Slack alerter](/blog/crash-alerts-slack-discord) too — dashboards are for investigating, alerts are for waking up.
