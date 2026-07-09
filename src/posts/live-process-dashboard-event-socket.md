---
title: Build a Live Process Dashboard from the Oxmgr Event Socket
description: A walkthrough for building a real-time web dashboard on top of Oxmgr's event bus and JSON API — snapshot the state, subscribe to the socket, and push updates to the browser over SSE. No polling.
date: 2026-07-20
tags: [oxmgr, dashboard, event-bus, node.js, sse, observability]
keywords: [process dashboard, oxmgr sdk, event socket dashboard, real-time process monitor, oxmgr node sdk, self hosted process dashboard, sse process manager]
author: Oxmgr Team
---

# Build a Live Process Dashboard from the Oxmgr Event Socket

The nicest thing about a real-time [event bus](/blog/process-manager-event-bus) is that it makes live dashboards trivial. You don't poll, you don't diff, you don't guess how often to refresh. You take one snapshot of the current state, then let events push every change to the browser as it happens.

This post builds a minimal but real dashboard: a Node backend that bridges Oxmgr's Unix socket to Server-Sent Events, and a browser page that renders a live table.

## Architecture

```
oxmgr daemon ──events.sock──▶ bridge (Node) ──SSE──▶ browser
                  ▲
                  └── oxmgr ls --json for the initial snapshot
```

Two data sources, one rule of thumb:

- **Snapshot** comes from [`oxmgr ls --json`](/blog/process-manager-json-jq-scripting) — the full current state when a browser first connects.
- **Deltas** come from the event socket — `process:*`, `health:*`, `log:*` — applied on top of the snapshot.

## The bridge

```js
// bridge.js
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import http from 'node:http';

const SOCK = path.join(
  os.homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/oxmgr/events.sock'
    : '.local/share/oxmgr/events.sock'
);

const clients = new Set();

function snapshot() {
  return new Promise((resolve) =>
    execFile('oxmgr', ['ls', '--json'], (_e, out) => resolve(out || '[]'))
  );
}

// Fan out one event to every connected browser
function broadcast(type, data) {
  const frame = `event: ${type}\ndata: ${data}\n\n`;
  for (const res of clients) res.write(frame);
}

// Subscribe to Oxmgr once, forward forever
function subscribe() {
  const client = net.connect(SOCK, () =>
    client.write(JSON.stringify({ subscribe: [] }) + '\n')
  );
  readline.createInterface({ input: client }).on('line', (line) =>
    broadcast('oxmgr', line)
  );
  client.on('close', () => setTimeout(subscribe, 2000));
  client.on('error', () => {});
}
subscribe();

http.createServer(async (req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(`event: snapshot\ndata: ${await snapshot()}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  }
}).listen(4321, () => console.log('dashboard on http://localhost:4321'));
```

The `subscribe: []` empty filter means "send me everything." A browser gets a `snapshot` event on connect, then a stream of `oxmgr` events forever.

## The page

The frontend keeps a map of processes keyed by name, seeds it from the snapshot, and mutates it on each event:

```js
const PAGE = /* html */ `
<!doctype html><meta charset=utf-8>
<title>oxmgr live</title>
<style>
  body { font: 14px/1.5 system-ui; margin: 2rem; }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; padding: .4rem .8rem; border-bottom: 1px solid #ddd; }
  .online { color: #16a34a; } .stopped, .crashed { color: #dc2626; }
</style>
<h1>Processes</h1>
<table><thead><tr><th>Name<th>Status<th>PID<th>Mem<th>Restarts<th>Health</tr></thead>
<tbody id=rows></tbody></table>
<script>
  const state = new Map();
  const es = new EventSource('/events');

  es.addEventListener('snapshot', (e) => {
    for (const p of JSON.parse(e.data)) state.set(p.name, p);
    render();
  });

  es.addEventListener('oxmgr', (e) => {
    const ev = JSON.parse(e.data);
    const name = ev.process?.name;
    if (!name) return;
    const p = state.get(name) ?? { name };
    if (ev.event?.startsWith('process:')) p.status = ev.event.split(':')[1];
    if (ev.event === 'health:healthy') p.health_status = 'healthy';
    if (ev.event === 'health:unhealthy') p.health_status = 'unhealthy';
    state.set(name, p);
    render();
  });

  function render() {
    document.getElementById('rows').innerHTML = [...state.values()].map(p => \`
      <tr>
        <td>\${p.name}</td>
        <td class="\${p.status}">\${p.status ?? '—'}</td>
        <td>\${p.pid ?? '—'}</td>
        <td>\${p.memory_bytes ? (p.memory_bytes/1e6|0)+'MB' : '—'}</td>
        <td>\${p.restart_count ?? '—'}</td>
        <td>\${p.health_status ?? '—'}</td>
      </tr>\`).join('');
  }
</script>`;
```

Open `http://localhost:4321`, then `oxmgr restart api` in another terminal — the status flips to `restarting` and back to `online` without a page refresh, because the event drove it.

## Run the dashboard under Oxmgr

Naturally, supervise the bridge with the thing it's watching:

```toml
[processes.dashboard]
command = "node bridge.js"
restart_on_exit = true

[processes.dashboard.health_check]
endpoint = "http://localhost:4321/"
interval_secs = 30
```

## Where to take it

This is ~120 lines and already useful. From here you can:

- **Add memory/CPU sparklines** by polling `oxmgr ls --json` every few seconds and merging into `state` — the events tell you *what* changed, the snapshot tells you *how much*.
- **Stream logs** by subscribing to `log:out` / `log:err` and appending to a per-process buffer.
- **Show crash context** — when a `process:crashed` event arrives, its `stderr_tail` is the stack trace; render it in a modal ([more on that here](/blog/debug-crashes-stderr-tail)).
- **Persist events** to build an [incident timeline](/blog/self-hosted-uptime-incident-timeline).

Because everything flows through one NDJSON stream, the same bridge pattern works for a TUI, a menu-bar app, or a Grafana panel. The [event bus](/blog/process-manager-event-bus) is the contract; the dashboard is just one consumer of it.
