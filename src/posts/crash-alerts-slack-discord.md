---
title: Send a Slack or Discord Alert When Your App Crashes (No Extra Monitoring Stack)
description: Wire Oxmgr's event bus to a Slack or Discord webhook so you get an instant, stack-trace-included alert the moment a process crashes — in about 30 lines and zero new infrastructure.
date: 2026-07-14
tags: [oxmgr, alerting, slack, discord, monitoring, devops]
keywords: [crash alert slack, node crash notification, discord webhook alert, process manager alerting, oxmgr events slack, self hosted alerting, app crash notification]
author: Oxmgr Team
---

# Send a Slack or Discord Alert When Your App Crashes

The classic way to find out your production app crashed is a user email. The second-classic way is a monitoring SaaS that costs $30/month and needs an agent on every box. There's a third way that costs nothing and takes half an hour: subscribe to your process manager's crash events and post them to a webhook.

With Oxmgr's [event bus](/blog/process-manager-event-bus), a crash event already contains everything a good alert needs — the process name, the signal that killed it, how long it ran, and the tail of stderr with the actual stack trace. You just have to forward it.

## The idea

1. Connect to Oxmgr's event socket.
2. Subscribe to `process:crashed` (and maybe `health:unhealthy`).
3. On each event, format a message and POST it to a Slack or Discord incoming webhook.
4. Run the forwarder itself under Oxmgr, so your alerter is supervised too.

No agent, no time-series database, no polling. The alert fires the instant the process dies.

## Step 1: Get a webhook URL

**Slack:** create an Incoming Webhook in your workspace's app settings; you get a URL like `https://hooks.slack.com/services/T00/B00/xxxx`.

**Discord:** channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL.

Keep the URL in an env file, not in code — see [managing secrets the right way](/blog/nodejs-environment-variables-production).

## Step 2: The forwarder

This one script handles both Slack and Discord depending on which env var you set:

```js
// alerter.js
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const WEBHOOK = process.env.ALERT_WEBHOOK_URL;
const IS_DISCORD = WEBHOOK.includes('discord');

const sock = path.join(
  os.homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/oxmgr/events.sock'
    : '.local/share/oxmgr/events.sock'
);

function format(e) {
  const p = e.process ?? {};
  const trace = (e.stderr_tail ?? []).join('\n').slice(-1500);
  const title = `🔴 ${p.name} crashed (${e.signal ?? 'exit'}) after ${e.uptime_secs ?? '?'}s`;
  const body = `${title}\ncwd: ${p.cwd}\ncommand: ${p.command}\n\n\`\`\`\n${trace}\n\`\`\``;
  return IS_DISCORD ? { content: body } : { text: body };
}

function connect() {
  const client = net.connect(sock, () => {
    client.write(JSON.stringify({ subscribe: ['process:crashed', 'health:unhealthy'] }) + '\n');
  });

  readline.createInterface({ input: client }).on('line', async (line) => {
    const event = JSON.parse(line);
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(format(event)),
    }).catch((err) => console.error('alert failed', err));
  });

  // Reconnect if the daemon restarts
  client.on('close', () => setTimeout(connect, 2000));
  client.on('error', () => {});
}

connect();
```

The key detail is `stderr_tail`: because Oxmgr captures the last stderr lines *at crash time*, your Slack message includes the panic or traceback. You don't have to SSH in and grep logs — the reason is in the notification.

## Step 3: Supervise the alerter itself

An alerter that dies silently is worse than no alerter. Run it under Oxmgr:

```toml
[processes.alerter]
command = "node alerter.js"
restart_on_exit = true
restart_delay_ms = 2000

[processes.alerter.env]
ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T00/B00/xxxx"
```

Now Oxmgr keeps the alerter online, and the alerter watches everything else — including, indirectly, itself: if it flaps, you'll see `process:restarting` events for `alerter` in the stream.

## Filtering the noise

Not every crash deserves a ping at 3 a.m. A few refinements:

- **Debounce boot loops.** If a process crashes 10 times in 10 seconds, you want one alert, not ten. Track the last alert time per process and suppress duplicates within, say, 60 seconds.
- **Escalate on `uptime_secs`.** A process that ran for hours then died is different from one that never started. Use `uptime_secs` to route: long-lived crash → urgent channel, instant crash → dev channel.
- **Watch health, not just crashes.** `health:unhealthy` fires when a [health check](/blog/nodejs-health-checks) fails even though the process is technically alive — often the earlier signal.

## Why this beats a monitoring SaaS for small setups

For a handful of VPSes, an external monitor gives you two things: alerting and history. This gives you alerting for free, with richer context (the stderr tail) than most agents collect. For history, pair it with an [incident timeline](/blog/self-hosted-uptime-incident-timeline) that persists the same events to SQLite. Together that's most of what a $30/month plan sells, running in a few megabytes on the box you already pay for.

If you outgrow it — dozens of servers, on-call rotations, escalation policies — reach for PagerDuty or Grafana OnCall. But for the stage most self-hosted apps are at, a webhook and 30 lines is the right amount of infrastructure.
