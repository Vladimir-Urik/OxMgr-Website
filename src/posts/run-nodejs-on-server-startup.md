---
title: How to Run Node.js App on Server Startup (systemd, launchd, Oxmgr)
description: Make your Node.js app start automatically when the server boots. Complete guide covering systemd on Linux, launchd on macOS, and Oxmgr's built-in system service registration.
date: 2026-04-27
tags: [node.js, systemd, launchd, startup, linux, macos, production]
keywords: [node.js start on boot, run node.js on startup, systemd node.js service, node.js autostart linux, node.js startup service, systemd node.js, node.js launchd macos, node.js server startup automatically]
author: Oxmgr Team
---

Your Node.js app is running in production. You restart the server for a kernel update — and your app doesn't come back up automatically. Users see errors until someone notices and SSHes in to restart it manually.

That's a fixable problem. This guide covers all three ways to make a Node.js app start on server boot: systemd (Linux), launchd (macOS), and Oxmgr's system service command.

## The Problem

Running `node server.js` or `oxmgr start` in a terminal session ties the process to that session. When the terminal closes or the SSH connection drops, the process is killed. When the server reboots, nothing restarts automatically.

You need the OS init system to be responsible for starting your app.

## Option 1: Oxmgr System Service (Recommended)

Oxmgr can register itself as a system service with one command:

```bash
sudo oxmgr service install
```

This creates the appropriate service file for your OS (systemd on Linux, launchd on macOS), enables it to start on boot, and starts it immediately.

To remove:

```bash
sudo oxmgr service uninstall
```

Check status:

```bash
oxmgr service status
```

The service uses your `oxfile.toml` to know what processes to manage. Oxmgr starts on boot, reads the config, and brings up all configured processes.

This is the fastest path. If you want to understand what's happening underneath — or you're using a different process manager — read on.

## Option 2: systemd (Linux)

Systemd is the init system on Ubuntu, Debian, CentOS, RHEL, Fedora, Arch, and virtually every other modern Linux distribution.

### Create the Service File

```bash
sudo nano /etc/systemd/system/myapp.service
```

Minimal working service:

```ini
[Unit]
Description=My Node.js Application
# Start after network is available
After=network.target

[Service]
Type=simple
User=nodeuser
WorkingDirectory=/var/www/myapp
ExecStart=/usr/bin/node /var/www/myapp/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Using Oxmgr via systemd

If you use Oxmgr for process management but want systemd to start it:

```ini
[Unit]
Description=Oxmgr Process Manager
After=network.target

[Service]
Type=forking
User=nodeuser
WorkingDirectory=/var/www/myapp
ExecStart=/usr/local/bin/oxmgr start --daemon
ExecStop=/usr/local/bin/oxmgr stop
ExecReload=/usr/local/bin/oxmgr reload
PIDFile=/var/run/oxmgr.pid
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
# Reload systemd to see the new file
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable myapp

# Start now
sudo systemctl start myapp

# Check status
sudo systemctl status myapp
```

### Verify It Survives Reboot

```bash
sudo reboot
# Wait for server to come back
ssh user@your-server
systemctl status myapp
# Should show: active (running)
```

### Useful systemd Commands

```bash
# View logs
journalctl -u myapp -f         # follow live
journalctl -u myapp -n 100     # last 100 lines
journalctl -u myapp --since "1 hour ago"

# Stop auto-start
sudo systemctl disable myapp

# Restart the service
sudo systemctl restart myapp

# Check if enabled on boot
systemctl is-enabled myapp
```

### Production-Grade systemd Unit

A more complete service file with environment variables, security hardening, and resource limits:

```ini
[Unit]
Description=My Node.js Application
Documentation=https://github.com/your/repo
After=network.target postgresql.service redis.service
Requires=network.target

[Service]
Type=simple
User=nodeuser
Group=nodegroup
WorkingDirectory=/var/www/myapp

# The command to run
ExecStart=/usr/bin/node /var/www/myapp/dist/server.js

# Environment variables
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/etc/myapp/env  # load secrets from file

# Restart behavior
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5   # stop if it crashes 5 times in 60 seconds

# Graceful shutdown
KillSignal=SIGTERM
TimeoutStopSec=30

# Security (optional but recommended)
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=yes

# Resource limits
LimitNOFILE=65536   # max open file descriptors
MemoryMax=1G        # kill if memory exceeds 1GB
CPUQuota=200%       # max 2 CPU cores worth of CPU time

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp

[Install]
WantedBy=multi-user.target
```

The `EnvironmentFile` approach keeps secrets out of the service file (which is world-readable):

```bash
# /etc/myapp/env — readable only by root
DATABASE_URL=postgresql://user:secretpassword@localhost/mydb
JWT_SECRET=your-jwt-secret-here
```

```bash
sudo chmod 600 /etc/myapp/env
```

For environment variable management best practices, see the [Node.js environment variables guide](/blog/nodejs-environment-variables-production).

## Option 3: launchd (macOS)

macOS uses launchd for service management. This is relevant for macOS servers (Mac Minis as servers, Mac Pro rack units, or macOS development environments that should auto-start services).

Create a plist file:

```bash
nano ~/Library/LaunchAgents/com.myapp.server.plist
```

For user-level services (starts when user logs in):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.myapp.server</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/myuser/myapp/server.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/myuser/myapp</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>3000</string>
    </dict>

    <!-- Start on load -->
    <key>RunAtLoad</key>
    <true/>

    <!-- Keep alive if it crashes -->
    <key>KeepAlive</key>
    <true/>

    <!-- Log files -->
    <key>StandardOutPath</key>
    <string>/Users/myuser/logs/myapp.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/myuser/logs/myapp-error.log</string>
</dict>
</plist>
```

Load and start:

```bash
launchctl load ~/Library/LaunchAgents/com.myapp.server.plist
launchctl start com.myapp.server
```

For system-level (starts on boot, before login) — use `/Library/LaunchDaemons/` with `sudo`:

```bash
sudo cp com.myapp.server.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.myapp.server.plist
```

macOS launchctl commands:

```bash
launchctl list | grep myapp    # check if running
launchctl stop com.myapp.server
launchctl start com.myapp.server
launchctl unload ~/Library/LaunchAgents/com.myapp.server.plist  # disable
```

## Creating a Dedicated User

Never run production Node.js as root. Create a dedicated system user:

```bash
# Linux
sudo useradd --system --no-create-home --shell /bin/false nodeuser

# Give it ownership of the app directory
sudo chown -R nodeuser:nodeuser /var/www/myapp
```

```ini
# In your systemd service
User=nodeuser
Group=nodeuser
```

If the app is compromised, the attacker has the permissions of `nodeuser` — not root.

## Checking After Reboot

After any reboot, verify the process is running:

```bash
# systemd
systemctl status myapp

# Oxmgr
oxmgr status

# Check the port is listening
ss -tlnp | grep 3000
# or
lsof -i :3000
```

## Common Issues

**Service starts then immediately stops:**
```bash
journalctl -u myapp --since "1 minute ago"
# Check the last exit code
systemctl status myapp | grep "Main PID"
```
Often a path issue — the `node` binary path or working directory is wrong.

**Environment variables not loading:**
The service environment is not the same as your shell. Don't assume `~/.bashrc` values are available. Set everything explicitly in the service file or an `EnvironmentFile`.

**Permissions error:**
The service user doesn't have read access to the app directory or write access to log directories:
```bash
sudo chown -R nodeuser:nodeuser /var/www/myapp
sudo mkdir -p /var/log/myapp && sudo chown nodeuser /var/log/myapp
```

**Port already in use after restart:**
The old process is still running (orphaned). Find and kill it:
```bash
lsof -ti:3000 | xargs kill
sudo systemctl start myapp
```

## Summary

| Method | Platform | Best For |
|--------|----------|----------|
| `oxmgr service install` | Linux + macOS | Fastest setup, uses oxfile.toml |
| systemd unit file | Linux | Full control, security hardening |
| launchd plist | macOS | macOS servers |

For most setups, `oxmgr service install` gets you there in one command. For production Linux servers where you want fine-grained control over security and resource limits, write a proper systemd unit file.

See the [PM2 vs systemd comparison](/blog/pm2-vs-systemd) if you're deciding between process managers for your Linux setup.
