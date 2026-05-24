---
title: Cron Jobs vs Process Managers — When to Use Each (and When to Use Both)
description: Cron schedules tasks. A process manager keeps things running. They overlap just enough to confuse people. Here's the practical decision framework.
date: 2026-05-24
tags: [cron, process-manager, scheduling, devops, linux]
keywords: [cron vs process manager, cron jobs production, scheduled tasks linux, process manager cron, systemd timer vs cron, cron alternative, scheduled jobs node.js, oxmgr cron]
author: Oxmgr Team
---

# Cron Jobs vs Process Managers

If you've ever asked yourself "should I run this as a cron job or as a long-running process?", you've hit one of the classic ambiguity zones in server ops. The two tools overlap in the middle and have wildly different sweet spots at the edges. This post is the decision framework, the failure modes, and where modern process managers blur the line.

## The Short Answer

- **Cron** is for *short tasks that run on a schedule*.
- **Process manager** is for *long-running processes that need to stay alive*.
- The overlap is *long-ish tasks that run on a schedule and need observability* — and that's where the choice gets interesting.

## What Cron Is Good At

```
0 */6 * * * /usr/local/bin/cleanup-tmp.sh
30 2 * * * /usr/local/bin/backup-db.sh
```

Two lines. Runs at the scheduled time. Logs to mail (by default) or to a file if you redirect. Reliable, well-understood, on every Linux box.

Cron is correct when:

- The task runs in seconds or low minutes.
- A missed run is acceptable (cron doesn't catch up on missed schedules).
- The task is idempotent or the schedule is sparse enough that overlap doesn't matter.
- You don't need to know whether it succeeded other than checking logs.

The classic cleanup-script use case.

## What Cron Is Bad At

The list is longer than people remember:

- **Silent failures.** A failing script with no stderr just disappears. Many ops teams have learned cron isn't running their backups months later.
- **Overlapping runs.** If a 5-minute cron takes 7 minutes, the next invocation starts before the first finishes. Cron doesn't care. Your database probably does.
- **No retry policy.** A job that fails because the DB was briefly unavailable is gone until the next schedule.
- **No dependency awareness.** "Run job B after job A succeeds" is a `flock` and a wrapper script and your problem.
- **Per-task environment is awkward.** Cron starts with a minimal `PATH`. The classic "works in my shell, fails in cron" bug.
- **Distributed cron is hard.** Three boxes with the same cron entry run the same job three times.

For one-off cleanup, none of this matters. For anything important, all of it matters.

## What a Process Manager Is Good At

A process manager (PM2, systemd, [Oxmgr](https://oxmgr.empellio.com)) supervises long-running processes:

- Keeps them alive across crashes.
- Captures stdout/stderr to durable logs.
- Restarts them with backoff.
- Reports their status, memory, uptime.
- Sends `SIGTERM` for graceful shutdown.

It's the right tool when your "task" is really a daemon — an API server, a queue worker, a background syncer that runs forever. Full primer in [what is a process manager](/blog/what-is-a-process-manager).

## What a Process Manager Is Bad At (Historically)

The pure long-running-process model has gaps for scheduled work:

- No native "run this every 6 hours" concept.
- No support for jobs that should run once and exit.
- Treats a clean exit as either "done, stop watching" or "crash, restart" depending on config.

Which is why for years the answer was: API and workers under PM2, cleanup scripts under cron, two configs to maintain.

## The Modern Blur

Modern supervisors handle scheduled tasks natively. systemd has timers; Oxmgr has scheduled processes:

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
restart = "on-failure"

[processes.backup]
command = "./scripts/backup-db.sh"
schedule = "0 2 * * *"
run_once = true
timeout = "30m"
on_failure = "alert"

[processes.cleanup-tmp]
command = "./scripts/cleanup-tmp.sh"
schedule = "0 */6 * * *"
run_once = true
```

What changes:

- The supervisor refuses to start a new instance while the previous is still running. No more overlap.
- A non-zero exit is logged and counted. Failures aren't silent.
- The `timeout` kills a hung run. No more zombie cron jobs.
- The same config describes your API, your workers, *and* your scheduled tasks. One file, one supervisor, one log destination.

The systemd equivalent uses a `.service` + `.timer` pair. More files but the same idea.

## A Decision Framework

Ask three questions:

**1. Does this need to run continuously?**

Yes → process manager, `restart = "on-failure"`.
No → continue.

**2. Does it run on a schedule?**

Yes → cron, systemd timer, or supervisor with `schedule`.
No → it's a one-off; don't automate it.

**3. Does the failure matter?**

If a missed run is invisible and acceptable → cron is fine.

If you need:
- to know when it failed,
- to prevent overlapping runs,
- to time it out and kill it,
- to retry on transient failure,
- to coordinate it with other processes,

→ use a supervisor with scheduling, not bare cron.

## Patterns by Workload

**Database backup**: schedule, must not overlap, must alert on failure → supervisor.

**Log rotation**: schedule, idempotent, missed run trivial → cron or logrotate (which uses cron under the hood).

**API server**: continuous, restart on crash → supervisor.

**Queue worker**: continuous, restart on crash → supervisor. (See the [BullMQ workers post](/blog/bullmq-workers-production) for the full pattern.)

**Hourly metric aggregation**: schedule, runs in seconds, occasional miss OK → cron.

**Nightly ETL that takes 4 hours**: schedule, must not overlap, must alert on failure → supervisor, definitely not cron.

**Send-emails-from-queue job**: this is a long-running worker, not a scheduled task. Supervisor. Don't `*/1 * * * *` a queue.

## Specific Failure Modes Worth Knowing

**The "missed it during downtime" trap.** If your server is down at 2 AM when the backup cron fires, the backup is just skipped. Cron has no replay. systemd timers have `Persistent=true` which catches up; Oxmgr scheduled processes have a `catch_up` flag. Bare crontab does not.

**The "race condition on overlapping run" trap.** Cron job A starts at 12:00 and is still running at 12:05 when A starts again. Both write to the same temp file. Corruption ensues. Use `flock` in cron, or a supervisor that enforces no-overlap natively.

**The "PATH is different in cron" trap.** Your script calls `aws` which is in `/usr/local/bin/`. Your shell finds it; cron doesn't. Set `PATH=...` at the top of crontab. Process managers have explicit `env` config which is harder to forget.

**The "I have no idea if it ran" trap.** Cron mails the output to `MAILTO` by default — and on most production VPSes, mail isn't configured. Output goes to `/dev/null`. Always redirect explicitly:

```
0 2 * * * /srv/scripts/backup.sh >> /var/log/backup.log 2>&1
```

A supervisor captures all output by default. No `2>&1` dance.

## Should You Migrate Existing Cron Jobs?

If they're working and you don't have an observability problem, no. The flip side: if you're already running a supervisor for your API, putting scheduled tasks in the same config is one less thing to learn about your system. New team members read `oxfile.toml` and see everything; nobody has to remember to also check `crontab -l -u deploy`.

Migration is mechanical:

```toml
[processes.old-cron]
command = "/srv/scripts/old-job.sh"
schedule = "0 */6 * * *"
run_once = true
```

Verify it runs as expected, then `crontab -e` and delete the line.

## When Cron Is Still the Right Answer

- One-line maintenance scripts on a box you barely touch.
- Standalone utility servers with no other supervised services.
- Cases where "this is broken, mail root" is genuinely good enough.
- Constraint environments where you can't install another tool.

There's no shame in cron. It's been doing this job for 50 years and it's not going anywhere.

## Bottom Line

Cron schedules tasks. A process manager keeps things running. The overlap — *scheduled tasks that must not fail silently* — is where modern process managers won. If you already have a supervisor, consolidating scheduled work into it removes a whole category of "did this even run?" questions.

[Oxmgr](https://oxmgr.empellio.com) treats scheduled jobs and long-running processes the same way: one config file, one log destination, one set of failure semantics. No more split between `crontab -l` and `systemctl status`.
