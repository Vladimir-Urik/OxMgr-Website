---
title: Real-Time Process Events with Oxmgr's Event Bus — Stream Crashes, Logs & Health Over a Unix Socket
description: How to subscribe to process lifecycle, log, and health events in real time using Oxmgr's Unix-socket event bus — the protocol, the filters, and what you can build on top of it.
date: 2026-07-11
tags: [oxmgr, event-bus, observability, unix-socket, devops]
keywords: [process manager events, oxmgr event bus, unix socket ndjson, real-time process events, oxmgr events command, process lifecycle events, streaming process manager]
author: Oxmgr Team
---

# Real-Time Process Events with Oxmgr's Event Bus

Most process managers are a black box you poll. You ask "what's running?" and get a snapshot. If you want to know the moment something changes, you ask again, and again, faster and faster, until you're hammering an API to catch events that last milliseconds.

Oxmgr's event bus flips that around. Instead of you asking, the daemon tells you — over a Unix domain socket, the instant anything happens. This post is the practical guide to using it.

## The transport

The daemon publishes to a Unix domain socket at `{base_dir}/events.sock`:

- **Linux:** `~/.local/share/oxmgr/events.sock`
- **macOS:** `~/Library/Application Support/oxmgr/events.sock`

The protocol is NDJSON — newline-delimited JSON — over a full-duplex stream:

1. **Client → server:** one JSON *filter* object followed by `\n`, sent within 500 ms of connecting.
2. **Server → client:** a stream of JSON event objects, one per line, until the socket closes.

A Unix socket instead of a TCP port is a deliberate choice: it's local-only by default (no accidental exposure to the network), it's fast, and access is governed by ordinary filesystem permissions.

## The quick way: `oxmgr events`

You don't have to write a socket client to use this. The CLI ships one:

```bash
# Everything, live
oxmgr events

# Only what you care about, with glob filters
oxmgr events --filter 'process:*' --filter 'health:unhealthy'

# Scoped to one process
oxmgr events --process api

# Raw NDJSON for piping into jq or a file
oxmgr events --json >> /var/log/oxmgr-events.ndjson
```

`--filter` / `-f` takes glob patterns and can be repeated. `--process` / `-p` restricts to a single process name. `--json` prints the raw event objects instead of a formatted line.

## The filter object

When you connect directly, you send a filter object first:

```json
{
  "subscribe": ["process:*", "health:*"],
  "process": "api"
}
```

| Field | Type | Meaning |
|---|---|---|
| `subscribe` | `string[]` | Glob patterns for event names. Empty array = all events. |
| `process` | `string \| null` | Only events for this process. `null` = all. `daemon:*` events are always delivered. |

Glob matching is what you'd expect: `*` matches every event, `process:*` matches the whole `process:` namespace, `process:crashed` matches exactly one event.

## The events

| Namespace | Events | When |
|---|---|---|
| `process` | `started`, `online`, `stopped`, `restarting`, `errored`, `crashed`, `exited` | Lifecycle transitions |
| `log` | `out`, `err` | A line was written to stdout / stderr |
| `health` | `healthy`, `unhealthy` | A [health check](/blog/nodejs-health-checks) passed or failed |
| `daemon` | `shutdown` | The daemon is stopping |

Every event carries a `process` object with the `name`, `command`, and `cwd`. Crash and exit events add three fields that turn a notification into a diagnosis:

- **`signal`** — the POSIX signal that ended it (`"SIGSEGV"`, `"SIGKILL"`, …).
- **`uptime_secs`** — how long it ran, so a boot loop is obvious.
- **`stderr_tail`** — the last ≤30 stderr lines, i.e. the stack trace or panic.

## A minimal client

Here's a full subscriber in a few lines of Node — no dependencies:

```js
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const sock = path.join(
  os.homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/oxmgr/events.sock'
    : '.local/share/oxmgr/events.sock'
);

const client = net.connect(sock, () => {
  client.write(JSON.stringify({ subscribe: ['process:*', 'health:*'] }) + '\n');
});

readline.createInterface({ input: client }).on('line', (line) => {
  const event = JSON.parse(line);
  console.log(event.event, event.process?.name, event.signal ?? '');
});
```

That's the whole contract. Send a filter, read lines, parse JSON.

## What you can build

The event bus is deliberately low-level, because the interesting stuff lives one layer up:

- **Instant crash alerts** to Slack or Discord — see [Send a Slack/Discord Alert When Your App Crashes](/blog/crash-alerts-slack-discord).
- **A live dashboard** driven by the socket instead of a polling loop — see [Build a Live Process Dashboard from the Oxmgr Event Socket](/blog/live-process-dashboard-event-socket).
- **An incident timeline** — persist every lifecycle event and you have self-hosted uptime history, covered in [Building an Uptime & Incident Timeline](/blog/self-hosted-uptime-incident-timeline).
- **Log shipping** to Loki, since `log:out` / `log:err` are already structured events.

Because the format is plain NDJSON, none of this needs a special library. `socat`, `nc`, a shell loop, or five lines of Python all work.

## A note on ordering and delivery

The bus is fire-and-forget. If no client is connected, events aren't queued — they're published to whoever is listening at that moment. If you need durable history, your subscriber is responsible for persistence (append to a file, insert into SQLite). That's by design: the daemon stays tiny and fast, and durability is a policy you choose, not one baked into the process manager.

Start with `oxmgr events` in a terminal, watch a real deploy or crash scroll by, and you'll quickly see which of your ops scripts can stop polling. When you're ready to script against it, [`oxmgr list --json`](/blog/process-manager-json-jq-scripting) pairs perfectly with the event stream — one gives you the current state, the other gives you the changes.
