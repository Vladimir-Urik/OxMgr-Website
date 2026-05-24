---
title: Scaling a WebSocket Server on a Single VPS — How Far Can You Push It?
description: Before you reach for Kubernetes and Redis adapters, see how many concurrent WebSocket connections a single $20 VPS can actually handle — and what to tune to get there.
date: 2026-06-25
tags: [websocket, nodejs, scaling, vps, production, devops]
keywords: [websocket server scaling, websocket vps, socket.io production, ws library production, websocket concurrent connections, websocket ulimit, websocket nodejs scaling, websocket nginx]
author: Oxmgr Team
---

# Scaling a WebSocket Server on a Single VPS

The reflex when WebSocket traffic grows is to reach for Kubernetes, sticky sessions, and a Redis pub/sub adapter. Sometimes that's right. Often it's premature: a single well-tuned $20 VPS can hold 100,000+ concurrent WebSocket connections for a typical chat or real-time dashboard workload. This post is about how to get there before you split into multiple boxes.

## What "Scale" Means Here

Three metrics matter:

1. **Concurrent connections** — how many WebSockets are open at once.
2. **Messages per second** — total throughput across all clients.
3. **Per-message work** — what the server actually does when a message arrives.

The first scales with kernel and Node configuration. The second scales with the event loop. The third is your code's problem. If your per-message work is "broadcast to all peers," your bottleneck is memory and network bandwidth, not CPU. If it's "calculate game state from 10 simultaneous players," your bottleneck is CPU and you'll need worker processes earlier.

## Step 1: File Descriptor Limits

Every WebSocket connection is a file descriptor. The default Linux limit is 1024 per process. At 1024 connections your server stops accepting and clients silently fail to connect.

Check current limit:

```bash
ulimit -n
```

Set it per-service. For systemd:

```ini
[Service]
LimitNOFILE=200000
```

For [Oxmgr](https://oxmgr.empellio.com):

```toml
[processes.ws]
command = "node dist/server.js"
[processes.ws.limits]
nofile = 200000
```

Also set the system-wide limit in `/etc/security/limits.conf`:

```
*  soft  nofile  200000
*  hard  nofile  200000
```

And `/etc/sysctl.conf`:

```
fs.file-max = 1000000
```

Then `sudo sysctl -p`. None of this matters until you've done all three layers.

## Step 2: Kernel Networking Tuning

The defaults are conservative. For a connection-heavy workload, add to `/etc/sysctl.conf`:

```
# More ephemeral ports for outbound connections
net.ipv4.ip_local_port_range = 1024 65535

# Faster TCP socket reuse
net.ipv4.tcp_tw_reuse = 1

# Bigger backlog for SYN floods and burst connect
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535

# Allow more pending connections per socket
net.core.netdev_max_backlog = 65535

# Reasonable buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
```

These won't break anything sane. Apply with `sudo sysctl -p` and you'll already see different behaviour at high connection counts.

## Step 3: Pick the Right Library

For Node, the choice is roughly:

- **`ws`** — minimal, fast, no framing on top of raw WebSocket.
- **`socket.io`** — message types, rooms, automatic reconnection, polling fallback.
- **`uWebSockets.js`** — C++ implementation with Node bindings. Significantly faster, especially at high connection counts.

For 50,000+ connections per process, `uWebSockets.js` is worth the effort — it uses 5-10x less RAM per connection than `ws` and handles message throughput much faster. For under 10,000 connections, the choice rarely matters; pick what your team is comfortable with.

A minimal `ws` server:

```ts
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

const server = createServer();
const wss = new WebSocketServer({ server, perMessageDeflate: false });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) client.send(data);
    });
  });
});

server.listen(8080, '127.0.0.1');
```

`perMessageDeflate: false` is important — compression saves bandwidth but costs CPU and memory per connection. For small messages, it's usually a net loss.

## Step 4: Reverse Proxy Configuration

Don't terminate WebSocket TLS in Node. Put nginx or Caddy in front.

Caddy:

```caddyfile
ws.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

That just works — Caddy auto-detects WebSocket upgrades.

nginx needs explicit upgrade headers:

```nginx
upstream ws_upstream {
    server 127.0.0.1:8080;
}

server {
    listen 443 ssl http2;
    server_name ws.example.com;

    location / {
        proxy_pass http://ws_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

`proxy_read_timeout 3600s` is critical. The default 60 seconds will silently drop idle WebSocket connections. Set it to whatever your application's idle ceiling is.

The full nginx baseline is in the [Node.js VPS setup post](/blog/nodejs-vps-setup-nginx-ssl).

## Step 5: Heartbeats

WebSockets that look open might already be dead — clients on flaky networks disappear without sending a close frame. Heartbeats let you detect this:

```ts
const HEARTBEAT_INTERVAL = 30_000;

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);
```

Without this you'll accumulate zombie connections, each holding a file descriptor and some memory, until you OOM. Heartbeats every 30 seconds is a good default.

## Step 6: Memory Per Connection

Rough numbers (varies by library and message buffering):

- `ws`: 15-25 KB per idle connection.
- `socket.io`: 30-60 KB per idle connection.
- `uWebSockets.js`: 2-5 KB per idle connection.

For 50,000 connections on `ws`: ~1 GB of RAM just for connections. Plus your application state. Plus Node's own overhead. On a 2 GB VPS you'll be tight; on a 4 GB VPS comfortable.

Set a hard memory cap so a leak becomes a restart, not a server-wide OOM:

```toml
[processes.ws.limits]
memory = "1500M"
```

The [resource limits post](/blog/nodejs-resource-limits-production) covers the rationale.

## Step 7: Graceful Shutdown — The Drain Problem

WebSocket connections are long-lived. A naïve restart kicks off thousands of clients simultaneously, all of which try to reconnect at once. That's a self-induced DDoS.

The pattern: send a close frame with a code that tells clients to back off:

```ts
const shutdown = async () => {
  console.log('draining ws...');

  // Tell clients to disconnect
  wss.clients.forEach((ws) => {
    ws.close(1012, 'restarting');
  });

  // Give them a moment to actually disconnect
  await new Promise((r) => setTimeout(r, 5000));

  wss.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
```

Client code should listen for code 1012 and implement exponential backoff on reconnect:

```ts
ws.addEventListener('close', (e) => {
  const backoff = e.code === 1012 ? randomBackoff(2000, 8000) : randomBackoff(500, 2000);
  setTimeout(reconnect, backoff);
});
```

The randomization spreads the reconnect storm across a window. Without it, every client retries at the same moment and your new process can't accept fast enough.

The general shutdown pattern is in the [graceful shutdown guide](/blog/nodejs-graceful-shutdown-complete-guide). The WebSocket-specific addition is the staggered reconnect.

## When You've Actually Outgrown One Box

Signs:

- CPU consistently >70% during normal load.
- Memory pressure even with hard caps.
- Tail latencies climbing.
- Network bandwidth saturated.

Then you split. Two patterns:

1. **Sharded by connection ID** — clients hash to a specific server. Simple, no shared state, broken if you need cross-shard broadcasts.
2. **Redis pub/sub adapter** — every server subscribes to all channels, forwards messages. Higher latency but supports broadcasts across servers.

If you're at the "do I need this?" stage and serving fewer than 30,000 concurrent connections, the answer is almost always "not yet."

## Supervision Setup

A complete `oxfile.toml` for a single-box WebSocket service:

```toml
[processes.ws]
command = "node dist/server.js"
cwd = "/srv/myapp"
env_file = ".env"
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "15s"

[processes.ws.health]
type = "http"
url = "http://127.0.0.1:8080/health"
interval = "10s"

[processes.ws.limits]
memory = "1500M"
nofile = 200000
```

Combined with the kernel tuning above, you're ready for a 5-figure connection count.

## Bottom Line

A WebSocket server on a single VPS scales further than most people assume — if you set file descriptor limits, tune the kernel, pick the right library, configure your reverse proxy, and handle drains carefully. The interesting upper bound is rarely "the server can't handle it" and usually "I didn't configure the boring stuff."

For the supervision layer specifically, [Oxmgr](https://oxmgr.empellio.com) handles per-process file descriptor limits, memory caps, and graceful drain timeouts from one config file.
