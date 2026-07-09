---
title: Oxmgr v0.5.0 — Real-Time Event Bus, JSON Output, and Richer Crash Diagnostics
description: Oxmgr 0.5.0 adds a Unix-socket event bus for streaming lifecycle, log, and health events, machine-readable `oxmgr list --json`, and crash events enriched with signal, uptime, and the stderr tail that killed your process.
date: 2026-07-09
tags: [announcement, oxmgr, release, event-bus, observability]
keywords: [oxmgr 0.5.0, oxmgr event bus, oxmgr events, oxmgr list json, process manager events, oxmgr changelog, oxmgr release]
author: Oxmgr Team
---

# Oxmgr v0.5.0

Until now, if you wanted to know what your processes were doing, you polled. You ran `oxmgr status` on a loop, or you hit the HTTP API every few seconds and diffed the results. It worked, but it was noisy, laggy, and it missed the interesting moments — the crash that happened between two polls.

Oxmgr **0.5.0** changes that. The headline feature is a **real-time event bus**: a Unix domain socket the daemon publishes to, so external tools can subscribe to lifecycle, log, and health events the instant they happen — no polling, no missed crashes.

## The event bus

The daemon now exposes a socket at `{base_dir}/events.sock` — by default `~/.local/share/oxmgr/events.sock` on Linux and `~/Library/Application Support/oxmgr/events.sock` on macOS. It speaks line-delimited JSON (NDJSON) in both directions.

The simplest way to see it is the new CLI command:

```bash
oxmgr events
```

That streams everything. To narrow it down, use glob filters and a process filter:

```bash
# Only crashes and restarts, for the "api" process
oxmgr events --filter 'process:crashed' --filter 'process:restarting' --process api

# Raw NDJSON, ready to pipe
oxmgr events --json | jq .
```

The events you can subscribe to:

| Namespace | Events |
|---|---|
| `process:*` | `started`, `online`, `stopped`, `restarting`, `errored`, `crashed`, `exited` |
| `log:*` | `out`, `err` |
| `health:*` | `healthy`, `unhealthy` |
| `daemon:*` | `shutdown` |

Everything you can do from the CLI, you can do from your own program: connect to the socket, send one JSON filter object within 500 ms, and read the stream. There's a full walkthrough in [Real-Time Process Events with Oxmgr's Event Bus](/blog/process-manager-event-bus).

## Crash events that actually tell you what happened

A crash event used to say "the process exited." Now it carries the forensics:

- **`signal`** — the POSIX signal name that killed it, e.g. `"SIGSEGV"` or `"SIGKILL"`.
- **`uptime_secs`** — how long it ran before dying, so you can tell a boot loop from a slow leak.
- **`stderr_tail`** — the last (up to 30) lines the process wrote to stderr before exiting.

That last one is the big one. `stderr_tail` captures the stack trace, panic, or traceback in the same payload as the crash notification — for **any language**. A Python traceback, a Node `UnhandledPromiseRejection`, a Go panic, a Rust `panic!` backtrace: whatever landed on stderr is right there. We wrote up how to use it for debugging in [Debugging Crashes with stderr_tail](/blog/debug-crashes-stderr-tail).

Every event's `process` object also now includes the full `command` and `cwd`, so a downstream consumer never has to cross-reference anything to know exactly what died and where.

## `oxmgr list --json`

`oxmgr list` (and its alias `oxmgr ls`) now takes a `--json` flag:

```bash
oxmgr list --json
```

Instead of the human table, you get a JSON array — one object per process, with the full schema: `id`, `name`, `command`, `args`, `status`, `pid`, `cpu_percent`, `memory_bytes`, `restart_count`, `cluster_mode`, `health_status`, and more. Empty lists emit `[]`, so your scripts never have to special-case "nothing running."

This makes Oxmgr scriptable without parsing tables:

```bash
# Names of every process that isn't online
oxmgr ls --json | jq -r '.[] | select(.status != "online") | .name'
```

More recipes in [Scripting Your Process Manager with `oxmgr list --json` and jq](/blog/process-manager-json-jq-scripting). Thanks to [@kvndrsslr](https://github.com/Vladimir-Urik/OxMgr/pull/66) for landing this one as their first contribution.

## Per-app log destinations

You can now point each process's logs wherever you want, via a `logs` table:

```toml
[processes.api]
command = "node dist/server.js"

[processes.api.logs]
stdout = "/var/log/myapp/api.out.log"
stderr = "/var/log/myapp/api.err.log"
```

Relative paths resolve against the oxfile directory and support `~` and `$VAR` expansion. If you leave it unset, the previous defaults apply. The PM2 ecosystem importer also learned `out_file`, `error_file`, and `log_file`, so imported configs keep their log paths.

## Fixes worth calling out

- **Relative `cwd` now resolves against the config file**, not the daemon's working directory — so `oxfile.toml` and imported PM2 configs behave the way you'd expect regardless of where the daemon was started.
- **`~`, `$VAR`, and `${VAR}` expand** in `env` values and `cwd` paths, and missing variables now fail loudly instead of silently becoming empty strings.
- **Lifecycle commands with a bare name** (`oxmgr stop api`) no longer break when a file or directory of the same name exists in the current directory.
- **The npm installer** now uses `tar` for extraction (fixing PowerShell 7 failures) and selects the static musl binary on older-glibc Linux (Debian 12, Ubuntu 22.04), fixing `GLIBC_x.yy not found`.

## Upgrading

```bash
npm install -g oxmgr@latest
# or
brew upgrade oxmgr
```

Nothing in 0.5.0 is a breaking change — the event socket spins up alongside the existing HTTP and IPC listeners, and every new field is additive. If you've been polling `oxmgr status` in a script, this is the release where you get to delete that loop.

The full changelog is on [GitHub](https://github.com/Vladimir-Urik/OxMgr). If you build something on top of the event bus, open an issue and show us — we're designing the [Node.js SDK](/blog/live-process-dashboard-event-socket) around real usage.
