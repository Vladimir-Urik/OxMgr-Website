---
title: Building an Uptime and Incident Timeline from Oxmgr Lifecycle Events
description: Turn your process manager's event stream into self-hosted uptime history — persist lifecycle events to SQLite, compute availability, and reconstruct exactly what happened during an incident.
date: 2026-10-06
tags: [uptime, incident, observability, sqlite, event-bus, process-manager, devops]
keywords: [self hosted uptime monitoring, incident timeline, process manager event history, uptime from lifecycle events, sqlite event log, availability calculation, oxmgr event persistence]
author: Oxmgr Team
---

# Building an Uptime and Incident Timeline

Uptime monitoring usually means an external service pinging your URL every minute. That tells you *whether* the site answered — but not *why* it didn't, or *which process* died, or *what the error was*. Your process manager knows all of that. Its [event bus](/blog/process-manager-event-bus) emits a precise, timestamped record of every start, crash, restart, and health transition. Persist that stream and you have something an external pinger can't give you: a complete internal incident timeline, self-hosted, for free.

## The idea

The [event bus](/blog/process-manager-event-bus) is real-time but ephemeral — if nobody's listening, events aren't stored. So we run one small persistent subscriber that writes every event to SQLite. From that table we can compute uptime, list incidents, and reconstruct any moment.

```
event bus ──▶ recorder ──▶ SQLite ──▶ uptime %, incident list, timeline
```

[SQLite is perfect here](/blog/sqlite-in-production-small-apps): one file, no server, fast for this volume, trivial to back up.

## Step 1: The schema

```sql
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,
  ts          INTEGER NOT NULL,     -- unix ms
  event       TEXT    NOT NULL,     -- e.g. process:crashed
  process     TEXT,
  signal      TEXT,
  uptime_secs INTEGER,
  stderr_tail TEXT,                 -- JSON array, for crash forensics
  raw         TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_process_ts ON events(process, ts);
```

## Step 2: The recorder

Subscribe to everything, insert every line. That's the whole job:

```js
// recorder.js
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import Database from 'better-sqlite3';

const db = new Database('/var/lib/oxmgr-history/events.db');
db.exec(/* the schema above */);
const insert = db.prepare(`INSERT INTO events
  (ts, event, process, signal, uptime_secs, stderr_tail, raw)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);

const SOCK = path.join(
  os.homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/oxmgr/events.sock'
    : '.local/share/oxmgr/events.sock'
);

function subscribe() {
  const c = net.connect(SOCK, () => c.write(JSON.stringify({ subscribe: [] }) + '\n'));
  readline.createInterface({ input: c }).on('line', (line) => {
    const e = JSON.parse(line);
    insert.run(
      Date.now(), e.event, e.process?.name ?? null, e.signal ?? null,
      e.uptime_secs ?? null,
      e.stderr_tail ? JSON.stringify(e.stderr_tail) : null,
      line
    );
  });
  c.on('close', () => setTimeout(subscribe, 2000));
  c.on('error', () => {});
}
subscribe();
```

Supervise it like everything else (it should record even its own restarts):

```toml
[processes.recorder]
command = "node recorder.js"
restart_on_exit = true
```

## Step 3: Compute uptime

A process is "down" between a `process:crashed`/`stopped`/`exited` and the next `process:online`. Availability is `1 − (downtime / window)`. A pragmatic query pairs each down-event with the following up-event:

```sql
WITH transitions AS (
  SELECT ts, event,
         CASE WHEN event IN ('process:crashed','process:stopped','process:exited') THEN 'down'
              WHEN event = 'process:online' THEN 'up' END AS state
  FROM events
  WHERE process = 'api' AND ts > (unixepoch('now','-30 days') * 1000)
)
SELECT * FROM transitions WHERE state IS NOT NULL ORDER BY ts;
```

Walk those transitions in code, sum the down intervals, divide by the 30-day window, and you have a real availability number for `api` — computed from *internal* events, so it counts crashes that recovered in 11 ms that an external pinger would never have caught.

## Step 4: The incident list

An "incident" is a crash and its aftermath. Because crash events carry [`stderr_tail`](/blog/debug-crashes-stderr-tail), each incident already includes its own root cause:

```sql
SELECT datetime(ts/1000,'unixepoch') AS when_, process, signal, uptime_secs,
       json_extract(stderr_tail, '$[#-1]') AS last_line
FROM events
WHERE event = 'process:crashed'
ORDER BY ts DESC
LIMIT 20;
```

That's a self-hosted incident feed: *when* it happened, *which* process, *how* it died (signal), *how long* it had been up, and the *last stderr line* — the answer to "what killed api last Tuesday?" months after the fact.

## Step 5: Reconstruct any moment

The real payoff is a timeline. To see everything around an incident, pull the window:

```sql
SELECT datetime(ts/1000,'unixepoch') AS t, event, process, signal
FROM events
WHERE ts BETWEEN :start AND :end
ORDER BY ts;
```

Now you can read the story in order: `health:unhealthy` at 03:11 (the health check started failing), `process:crashed SIGKILL` at 03:12 (the [OOM killer](/blog/linux-oom-killer-nodejs) — empty stderr tail confirms it), `process:restarting`, `process:online` at 03:12 (recovered in seconds), health back to `healthy` at 03:13. That's a full postmortem, assembled automatically from events you were already emitting.

## How this complements the rest

This is the *history* layer. It pairs with:

- **[Slack alerts](/blog/crash-alerts-slack-discord)** — the real-time "it's happening now" signal.
- **[Prometheus + Grafana](/blog/prometheus-grafana-process-metrics)** — trends and threshold alerting.
- **[Loki logs](/blog/ship-logs-to-loki-grafana)** — the full log context around each event.

All four consume the same [event bus](/blog/process-manager-event-bus). Alerts wake you up, metrics show trends, logs give detail, and this timeline lets you answer "what exactly happened, and how often has it happened before?" — the questions that matter *after* the incident, when you're writing the postmortem and deciding what to fix.

## Why self-host it

An external uptime monitor tells your users' story — did the site answer? This tells the *system's* story — what did each process do, and why. Both are worth having, but only one of them you can build in an afternoon on the box you already run, with richer data than any pinger collects. Persist the event stream, and your process manager quietly becomes your incident historian.
