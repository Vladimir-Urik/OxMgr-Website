---
title: Node.js VPS Setup — Nginx, Process Manager, SSL (Complete 2026 Guide)
description: Set up a production Node.js server from scratch. This guide covers initial VPS hardening, Nginx as a reverse proxy, SSL with Let's Encrypt, and Oxmgr for process management — in one complete walkthrough.
date: 2026-05-03
tags: [node.js, nginx, ssl, vps, linux, production, devops, setup]
keywords: [node.js vps setup, nodejs nginx ssl, node.js production server setup, nginx node.js reverse proxy, let's encrypt node.js, node.js linux server setup 2026, vps node.js nginx, node.js https setup]
author: Oxmgr Team
---

A brand new VPS. A Node.js app ready to deploy. Here's the full setup — from raw Ubuntu server to production-ready stack running HTTPS with automatic restarts and zero-downtime deploys.

This guide uses Ubuntu 24.04 LTS, Nginx, Let's Encrypt, and Oxmgr.

## 1. Initial Server Setup

### Create a Non-Root User

Never run anything as root in production:

```bash
adduser deploy
usermod -aG sudo deploy

# Copy SSH keys to the new user
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Log out and back in as `deploy`:

```bash
ssh deploy@your-server-ip
```

### Firewall Setup

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status
```

### Disable Root SSH Login

```bash
sudo nano /etc/ssh/sshd_config
```

Set:
```ini
PermitRootLogin no
PasswordAuthentication no   # key-only auth
```

```bash
sudo systemctl restart ssh
```

### System Updates

```bash
sudo apt update && sudo apt upgrade -y
```

Set up automatic security updates:

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

## 2. Install Node.js

Use NodeSource for the latest LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # v22.x.x
npm --version
```

Or use `nvm` if you need multiple Node.js versions:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts
```

## 3. Install Oxmgr

```bash
npm install -g oxmgr
oxmgr --version
```

## 4. Deploy Your Application

Create a directory for your app:

```bash
sudo mkdir -p /var/www/myapp
sudo chown deploy:deploy /var/www/myapp
```

Clone your repository:

```bash
cd /var/www/myapp
git clone https://github.com/yourname/myapp.git .
npm ci --omit=dev
npm run build
```

Create `oxfile.toml`:

```toml
[processes.api]
command = "node dist/server.js"
instances = 2
restart_on_exit = true
restart_delay_ms = 1000
max_restarts = 10

[processes.api.env]
NODE_ENV = "production"
PORT = "3000"

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 30
initial_delay_secs = 10
unhealthy_threshold = 3
```

Test it starts:

```bash
oxmgr start
oxmgr status
curl http://localhost:3000/health
```

## 5. Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Configure Nginx as Reverse Proxy

Create the site config:

```bash
sudo nano /etc/nginx/sites-available/myapp
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1024;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Pass real client info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # Static files served directly by Nginx (much faster)
    location /static/ {
        alias /var/www/myapp/dist/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check — don't proxy to app, respond directly
    location /nginx-health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # remove default

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

Visit `http://your-domain.com` — your app should be accessible.

## 6. SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot:
1. Verifies domain ownership
2. Gets the certificate
3. **Automatically edits your Nginx config** to enable HTTPS
4. Sets up auto-renewal

Your Nginx config now looks like:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # ... rest of your config
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

Certificates renew automatically via systemd timer (check with `systemctl list-timers | grep certbot`).

## 7. Load Balancing Multiple Instances

When you run `instances = 2` in Oxmgr, each instance needs a unique port. Update your setup:

```toml
[processes.api]
command = "node dist/server.js"
instances = 2
restart_on_exit = true

[processes.api.env]
NODE_ENV = "production"
PORT = "3000"   # instance 0 gets 3000, instance 1 gets 3001
```

In your app:

```javascript
const port = parseInt(process.env.PORT) + parseInt(process.env.OXMGR_INSTANCE_ID || '0');
server.listen(port);
```

Update Nginx to load-balance across both:

```nginx
upstream api_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;

    # Keep connections alive to backend
    keepalive 32;
}

server {
    listen 443 ssl;

    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";  # for keepalive upstream
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 8. Start Oxmgr on Boot

Register Oxmgr as a system service so it starts automatically on reboot:

```bash
sudo oxmgr service install
```

Verify:

```bash
sudo systemctl status oxmgr
```

Or follow the [server startup guide](/blog/run-nodejs-on-server-startup) to create a custom systemd unit.

## 9. Log Rotation

Prevent logs from filling your disk:

```bash
sudo nano /etc/logrotate.d/myapp
```

```
/var/log/myapp/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 deploy deploy
    postrotate
        oxmgr reload api > /dev/null 2>&1 || true
    endscript
}
```

Oxmgr also has built-in log rotation via `oxfile.toml`:

```toml
[processes.api.logs]
max_size_mb = 100
max_files = 7
compress = true
```

## 10. Monitoring

Check that everything is healthy:

```bash
# App status
oxmgr status

# Nginx status
sudo systemctl status nginx

# SSL cert expiry
sudo certbot certificates

# Disk space
df -h

# System load
uptime
```

Set up process monitoring alerts as described in the [Node.js process monitoring guide](/blog/nodejs-process-monitoring-production).

## Final Checklist

Before calling it production-ready:

- [ ] SSH key authentication only (password disabled)
- [ ] Firewall enabled (ports 22, 80, 443 only)
- [ ] Node.js app not running as root
- [ ] Oxmgr with `restart_on_exit = true` and `max_restarts`
- [ ] Health check endpoint working
- [ ] Nginx with HTTPS (HTTP redirects to HTTPS)
- [ ] SSL certificate installed and auto-renewing
- [ ] Oxmgr starts on server reboot
- [ ] Log rotation configured
- [ ] `NODE_ENV=production` set

This setup handles most production workloads up to a few hundred requests/second on a single VPS. When you need to scale beyond a single server, add a load balancer and replicate this setup across multiple machines.
