---
title: Debugging Crashes with stderr_tail — Capture the Stack Trace That Killed Your App
description: Oxmgr's crash events include stderr_tail — the last lines your process wrote before dying. Here's how to use it to debug crashes in any language without SSHing in to grep logs.
date: 2026-07-23
tags: [oxmgr, debugging, crashes, observability, devops]
keywords: [capture crash stack trace, stderr tail, debug production crash, process crash logs, oxmgr crash event, signal sigsegv sigkill, node python go panic]
author: Oxmgr Team
---

# Debugging Crashes with stderr_tail

The worst part of a production crash isn't the crash — it's the archaeology. The process is already gone. You SSH in, find the log directory, tail the right file, scroll past thousands of normal lines, and hope the fatal error is still there and hasn't rotated away. By the time you've reconstructed *what* happened, the incident is 20 minutes old.

Oxmgr attaches the evidence to the crash itself. Every `process:crashed` and `process:exited` [event](/blog/process-manager-event-bus) carries **`stderr_tail`** — the last up-to-30 lines the process wrote to stderr before it died. The stack trace comes to you.

## What's in a crash event

```json
{
  "event": "process:crashed",
  "process": {
    "name": "api",
    "command": "node dist/server.js",
    "cwd": "/srv/api"
  },
  "signal": "SIGSEGV",
  "uptime_secs": 4210,
  "stderr_tail": [
    "/srv/api/dist/db.js:88",
    "    throw new Error('connection pool exhausted');",
    "          ^",
    "Error: connection pool exhausted",
    "    at acquire (/srv/api/dist/db.js:88:11)",
    "    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)"
  ]
}
```

Three fields do the diagnostic work:

- **`signal`** tells you *how* it died. `SIGSEGV` is a memory fault (often native addons). `SIGKILL` with no stderr is almost always the [OOM killer](/blog/linux-oom-killer-nodejs). `SIGTERM` is a normal shutdown. A clean non-zero exit is application logic.
- **`uptime_secs`** tells you the *shape* of the failure. Died in under a second? It never started — bad config or missing env. Ran for 70 minutes then died? A leak or a resource exhaustion, like the pool above.
- **`stderr_tail`** tells you *why*. It's the last thing the program said, which for a crash is the traceback.

## It works for every language

`stderr_tail` isn't Node-specific — it's whatever the process wrote to file descriptor 2. That means it captures:

- **Node.js** — the `Error:` and its stack, unhandled rejections.
- **Python** — the full `Traceback (most recent call last):` block (see [Python in production](/blog/python-process-manager-production)).
- **Go** — `panic:` plus the goroutine dump.
- **Rust** — `thread 'main' panicked at ...` with a backtrace if `RUST_BACKTRACE=1`.
- **Java** — the exception and stack (see [Spring Boot in production](/blog/spring-boot-production-deployment)).

Oxmgr doesn't parse or interpret any of it. It just hands you the last words, verbatim, in the same payload as the notification.

## Turning it into a workflow

The point isn't to read events by hand. Wire `stderr_tail` into wherever you already look:

**Into Slack.** The [crash alerter](/blog/crash-alerts-slack-discord) drops the tail into a code block, so the stack trace is in the channel before anyone opens a terminal.

**Into your terminal, live.** During a deploy, keep a stream open:

```bash
oxmgr events --filter 'process:crashed' --json \
  | jq -r '.process.name + " (" + (.signal // "exit") + "):\n" + (.stderr_tail | join("\n"))'
```

Now a crash during rollout prints the reason immediately, and you can [roll back](/blog/instant-rollback-deployment) on the spot.

**Into an incident log.** Append every crash event to SQLite and you can answer "what killed api last Tuesday?" months later — the basis of a [self-hosted incident timeline](/blog/self-hosted-uptime-incident-timeline).

## Reading the signal like a triage nurse

A quick lookup table for the common cases:

| Signal / exit | Usual cause | First thing to check |
|---|---|---|
| `SIGKILL`, empty stderr | OOM killer | `dmesg -T \| grep -i oom`, memory limits |
| `SIGSEGV` | Native crash | Native addons, mismatched binaries |
| `SIGABRT` | Assertion / `abort()` | The stderr tail — it usually names the assert |
| Exit code, with traceback | Application bug | Read `stderr_tail`; fix the throw |
| `SIGTERM`, short uptime | Something is stopping it | A [deploy](/blog/zero-downtime-deployment) or a supervisor conflict |

## Make sure your app actually writes to stderr

`stderr_tail` can only capture what your process emits. Two things to get right:

1. **Don't swallow fatal errors.** An `uncaughtException` handler that logs to a remote service but not stderr leaves the tail empty. Always let the trace hit stderr on the way out — see [why your app keeps crashing](/blog/nodejs-app-keeps-crashing) for the handler patterns.
2. **Log tracebacks, not just messages.** `console.error(err.message)` gives you one line; `console.error(err)` gives you the stack. The second is what you want in `stderr_tail`.

Once your app is honest on stderr, Oxmgr does the rest: it holds onto those last lines and ships them the moment the process dies. The archaeology disappears, and debugging a production crash starts with reading the reason instead of hunting for it.
