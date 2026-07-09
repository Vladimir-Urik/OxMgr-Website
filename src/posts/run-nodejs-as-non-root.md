---
title: Running Node.js as a Non-Root User (and Why You Must)
description: Running your app as root is a needless security risk. Here's how to run Node — or any app — as an unprivileged user, bind to port 80/443 safely, handle file permissions, and let a process manager enforce it.
date: 2026-09-21
tags: [security, linux, node.js, non-root, production, devops]
keywords: [run node as non root user, nodejs non root port 80, drop privileges nodejs, run app unprivileged user, setcap node port 443, process manager run as user, linux least privilege]
author: Oxmgr Team
---

# Running Node.js as a Non-Root User

It's the most common production security mistake and the easiest to fix: running your app as `root`. When your app runs as root, any remote-code-execution bug in your code — or in any of your thousand npm dependencies — becomes full control of the machine. Run it as an unprivileged user and the same bug is contained to what that user can touch. This is the "least privilege" principle, and it costs you almost nothing to apply.

## Why root is dangerous here

Your Node process executes a lot of code you didn't write. A single compromised dependency, a deserialization bug, a path-traversal flaw — any of these can let an attacker run commands *as your process's user*. If that user is root, they can install backdoors, read every file, pivot to other services, and erase their tracks. If that user is `appuser` with access only to `/srv/myapp`, the blast radius is one directory. Same bug, wildly different outcome.

## Step 1: Create a dedicated user

Give the app its own system user with no login shell and no home clutter:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin appuser
sudo chown -R appuser:appuser /srv/myapp
```

One user per app is even better — it isolates apps from each other, not just from the system.

## Step 2: The port 80/443 problem (and the right fix)

The reason people run as root is usually binding to port 80 or 443 — ports below 1024 require privilege. **Don't solve this by running as root.** Solve it properly:

**Best: don't bind low ports at all.** Run your app on a high port (3000) bound to loopback, and put a [reverse proxy](/blog/nodejs-vps-setup-nginx-ssl) (nginx/Caddy) on 80/443. The proxy handles privileged ports and TLS; your app never needs privilege. This is what you should do in production anyway.

**If you truly must bind low ports directly**, grant the capability to the binary instead of running as root:

```bash
sudo setcap 'cap_net_bind_service=+ep' "$(command -v node)"
```

Now `node` can bind port 443 as any user. (Caveat: this applies to the Node binary itself; scope it carefully.)

## Step 3: Run the process as that user

Your process manager should launch the app *as* `appuser`, so you never depend on remembering to `su`. With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.api]
command = "node dist/server.js"
working_dir = "/srv/myapp"
user = "appuser"
restart_on_exit = true
```

The daemon drops privileges before executing your command, so even if the manager runs as root (to bind ports or write to `/var/log`), your *app* runs unprivileged. That separation — privileged supervisor, unprivileged app — is exactly what you want.

The systemd equivalent, if you go that route, is `User=appuser` in the unit file — the [boot integration](/blog/run-nodejs-on-server-startup) covers registering it.

## Step 4: Get file permissions right

Least privilege only works if the app user has *just enough* access:

```bash
# App code: readable, not writable by the app (so an RCE can't modify code)
sudo chown -R root:appuser /srv/myapp
sudo chmod -R 750 /srv/myapp

# Writable dirs the app genuinely needs (uploads, logs): owned by appuser
sudo chown -R appuser:appuser /srv/myapp/uploads /var/log/myapp
```

Making the *code* read-only to the app user is a quietly powerful hardening step: an attacker who gains execution can't rewrite your application to persist. Point your [per-process log files](/blog/nodejs-log-management) at a directory the app user can write, and keep secrets in an [env file](/blog/nodejs-environment-variables-production) readable only by `appuser` (`chmod 600`).

## Step 5: Verify

Confirm it's actually running unprivileged:

```bash
ps -o user,pid,cmd -p "$(pgrep -f 'dist/server.js')"
# USER should be 'appuser', not 'root'
```

Or straight from the process manager list:

```bash
oxmgr ls --json | jq -r '.[] | "\(.name): \(.command)"'
```

## The broader hardening context

Non-root is one layer. The full baseline for a self-hosted box:

- **Firewall** — `ufw` allowing only SSH + 80/443.
- **A reverse proxy** for TLS and low ports, so the app stays on a high loopback port.
- **Read-only code, writable data** — the permission split above.
- **Secrets in a `600` env file**, never in code or process args.
- **A non-root deploy user** for SSH too, with `sudo` for the few things that need it.

Most of this is covered in the [production best practices checklist](/blog/nodejs-production-best-practices). But if you do exactly one security thing today, make it this one: stop running your app as root. It's a five-minute change that turns a catastrophic class of vulnerability into a contained one.
