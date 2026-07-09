---
title: Exporting Process Metrics to Prometheus and Grafana from a Process Manager
description: How to turn your process manager's data into Prometheus metrics and Grafana dashboards — a small exporter that reads process CPU, memory, and restart counts, plus event-driven crash counters.
date: 2026-09-12
tags: [prometheus, grafana, metrics, observability, process-manager, devops]
keywords: [nodejs prometheus grafana metrics, process manager prometheus exporter, export process metrics, grafana process dashboard, prometheus custom exporter, monitor process cpu memory prometheus]
author: Oxmgr Team
---

# Exporting Process Metrics to Prometheus and Grafana

Prometheus and Grafana are the standard for self-hosted metrics, and your process manager already knows everything worth graphing: per-process CPU, memory, restart counts, health status, and — via the [event bus](/blog/process-manager-event-bus) — every crash and restart as it happens. You just need a small exporter to bridge the two. Here's the whole thing.

## The architecture

```
oxmgr ls --json ─┐
                 ├─▶ exporter (/metrics) ◀──scrape── Prometheus ──▶ Grafana
event bus ───────┘
```

Two data sources feed the exporter:

- **[`oxmgr ls --json`](/blog/process-manager-json-jq-scripting)** gives you *gauge* metrics — current CPU, memory, restart count, health — sampled each scrape.
- **The [event bus](/blog/process-manager-event-bus)** gives you *counter* metrics — total crashes, restarts, health transitions — incremented as events arrive.

## A minimal exporter

Prometheus scrapes a plain-text `/metrics` endpoint, so the exporter is small. This one snapshots the process list on each scrape and keeps event-driven counters in memory:

```js
// exporter.js
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';

const SOCK = path.join(
  os.homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/oxmgr/events.sock'
    : '.local/share/oxmgr/events.sock'
);

// Event-driven counters
const crashes = new Map();   // name -> count
const restarts = new Map();

function subscribe() {
  const c = net.connect(SOCK, () =>
    c.write(JSON.stringify({ subscribe: ['process:crashed', 'process:restarting'] }) + '\n')
  );
  readline.createInterface({ input: c }).on('line', (line) => {
    const e = JSON.parse(line);
    const n = e.process?.name;
    if (!n) return;
    if (e.event === 'process:crashed') crashes.set(n, (crashes.get(n) ?? 0) + 1);
    if (e.event === 'process:restarting') restarts.set(n, (restarts.get(n) ?? 0) + 1);
  });
  c.on('close', () => setTimeout(subscribe, 2000));
  c.on('error', () => {});
}
subscribe();

function snapshot() {
  return new Promise((res) =>
    execFile('oxmgr', ['ls', '--json'], (_e, out) => res(JSON.parse(out || '[]')))
  );
}

http.createServer(async (req, res) => {
  if (req.url !== '/metrics') { res.writeHead(404).end(); return; }
  const procs = await snapshot();
  const lines = [
    '# TYPE oxmgr_process_cpu_percent gauge',
    '# TYPE oxmgr_process_memory_bytes gauge',
    '# TYPE oxmgr_process_restart_count gauge',
    '# TYPE oxmgr_process_up gauge',
    '# TYPE oxmgr_process_crashes_total counter',
  ];
  for (const p of procs) {
    const l = `{name="${p.name}"}`;
    lines.push(`oxmgr_process_cpu_percent${l} ${p.cpu_percent ?? 0}`);
    lines.push(`oxmgr_process_memory_bytes${l} ${p.memory_bytes ?? 0}`);
    lines.push(`oxmgr_process_restart_count${l} ${p.restart_count ?? 0}`);
    lines.push(`oxmgr_process_up${l} ${p.status === 'online' ? 1 : 0}`);
    lines.push(`oxmgr_process_crashes_total${l} ${crashes.get(p.name) ?? 0}`);
  }
  res.writeHead(200, { 'content-type': 'text/plain' }).end(lines.join('\n') + '\n');
}).listen(9110, () => console.log('exporter on :9110/metrics'));
```

## Scrape it

Point Prometheus at the exporter:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: oxmgr
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:9110']
```

## Supervise the exporter (obviously)

The exporter watches your processes, so supervise it with the same process manager:

```toml
[processes.metrics]
command = "node exporter.js"
restart_on_exit = true
[processes.metrics.health_check]
endpoint = "http://localhost:9110/metrics"
interval_secs = 30
```

## Useful Grafana panels

Once the metrics are flowing, the panels that actually earn their place:

- **Memory per process** (`oxmgr_process_memory_bytes`) — the graph that reveals a [memory leak](/blog/nodejs-memory-leaks-production) as a slow upward ramp before it becomes an [OOM kill](/blog/linux-oom-killer-nodejs).
- **Restart rate** (`rate(oxmgr_process_restart_count[5m])`) — a spike here is a [crash loop](/blog/nodejs-app-keeps-crashing) in progress.
- **Crashes over time** (`increase(oxmgr_process_crashes_total[1h])`) — driven by the event bus, so it's exact, not sampled.
- **Uptime / availability** (`avg_over_time(oxmgr_process_up[24h])`) — your self-hosted SLA number.

## Alerting

Prometheus Alertmanager closes the loop. A simple rule:

```yaml
- alert: ProcessDown
  expr: oxmgr_process_up == 0
  for: 1m
  annotations:
    summary: "{{ $labels.name }} has been down for 1 minute"
```

For instant, richer alerts (with the crash's stderr tail) the [event-bus Slack alerter](/blog/crash-alerts-slack-discord) complements this nicely — Prometheus is great for *trends and thresholds*, the event bus is great for *this-exact-crash-right-now*. Run both.

## Why bother when the SaaS does it?

Datadog and friends do this out of the box — and bill per host and per metric. For a self-hosted stack, Prometheus + Grafana + this ~80-line exporter gives you the same graphs and alerts on the box you already pay for. The [logs side of the story](/blog/ship-logs-to-loki-grafana) uses the same event bus to ship logs to Loki, so you end up with metrics *and* logs in one Grafana, entirely self-hosted.
