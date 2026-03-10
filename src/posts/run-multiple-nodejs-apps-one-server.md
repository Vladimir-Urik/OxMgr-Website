---
title: How to Run Multiple Node.js Apps on One Server (Without Conflicts)
description: Running multiple Node.js apps on a single VPS — port management, Nginx reverse proxy, separate users, process managers, and environment isolation. A complete practical guide.
date: 2026-04-03
tags: [node.js, vps, nginx, deployment, process-manager, production]
keywords: [run multiple node.js apps, multiple node.js apps one server, multiple node.js apps vps, nodejs multiple apps nginx, run multiple node apps same server, node.js multiple ports, multiple node.js projects one server, host multiple node.js apps]
author: Oxmgr Team
---

# How to Run Multiple Node.js Apps on One Server

You have a VPS and three Node.js projects you want to host. They can all share the same server — you just need to get port management, Nginx routing, and process isolation right.

Here's the full setup.

## The Architecture

Each app gets:
- Its own **port** (3000, 3001, 3002, etc.) — internal only
- Its own **process(es)** managed by a process manager
- Its own **domain or path** routed by Nginx
- Its own **user** (optional but good practice)

Nginx sits at port 80/443 and routes incoming traffic to the right app based on the domain name or URL path:

```
Internet → Nginx :443
                ├── api.mycompany.com  → localhost:3000 (API)
                ├── app.mycompany.com  → localhost:3001 (Frontend)
                └── admin.mycompany.com → localhost:3002 (Admin panel)
```

## Step 1: Pick a Port Strategy

Apps can't share ports. Assign a port range per app and stick to it:

```
3000–3009 → api (up to 10 cluster instances)
3010–3019 → frontend
3020–3029 → admin
```

Or simpler: one port per app, let the process manager handle clustering internally:

```
3000 → api (process manager runs 4 workers, all on 3000)
3001 → frontend
3002 → admin
```

Oxmgr handles port sharing across instances automatically — all 4 workers listen on 3000, the OS distributes connections between them.

## Step 2: Configure All Apps in One oxfile.toml

Keep all apps in a single config file at a central location like `/etc/oxmgr/oxfile.toml`:

```toml
# /etc/oxmgr/oxfile.toml

[processes.api]
command = "node dist/server.js"
working_dir = "/var/www/api"
instances = 2
restart_on_exit = true
env = { NODE_ENV = "production", PORT = "3000" }
env_file = "/var/www/api/.env"

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 15

[processes.frontend]
command = "node .output/server/index.mjs"
working_dir = "/var/www/frontend"
instances = 2
restart_on_exit = true
env = { NODE_ENV = "production", PORT = "3001" }
env_file = "/var/www/frontend/.env"

[processes.frontend.health_check]
endpoint = "http://localhost:3001/health"
interval_secs = 15

[processes.admin]
command = "node dist/server.js"
working_dir = "/var/www/admin"
instances = 1
restart_on_exit = true
env = { NODE_ENV = "production", PORT = "3002" }
env_file = "/var/www/admin/.env"
```

Start everything:

```bash
oxmgr start --config /etc/oxmgr/oxfile.toml
```

Check status:

```bash
oxmgr status
# PROCESS     PID    STATUS   UPTIME   MEM
# api:0       1234   running  2h 15m   48 MB
# api:1       1235   running  2h 15m   47 MB
# frontend:0  1240   running  2h 14m   62 MB
# frontend:1  1241   running  2h 14m   61 MB
# admin:0     1250   running  2h 13m   35 MB
```

## Step 3: Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt install nginx -y
```

Create a config file per app:

```nginx
# /etc/nginx/sites-available/api
server {
    listen 80;
    server_name api.mycompany.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

```nginx
# /etc/nginx/sites-available/frontend
server {
    listen 80;
    server_name mycompany.com www.mycompany.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Cache static assets directly via Nginx for better performance
    location ~* \.(js|css|png|jpg|ico|svg|woff2)$ {
        proxy_pass http://localhost:3001;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, max-age=2592000";
    }
}
```

Enable sites and reload:

```bash
sudo ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 4: HTTPS with Certbot

Get TLS certificates for all domains at once:

```bash
sudo apt install certbot python3-certbot-nginx -y

sudo certbot --nginx \
  -d mycompany.com \
  -d www.mycompany.com \
  -d api.mycompany.com \
  -d admin.mycompany.com
```

Certbot modifies your Nginx configs automatically and sets up auto-renewal. After this, all traffic is HTTPS.

## Step 5: Separate Users (Recommended)

Running multiple apps as different users limits the blast radius if one app is compromised:

```bash
# Create a user per app
sudo adduser --system --group api-user
sudo adduser --system --group frontend-user
sudo adduser --system --group admin-user

# Set ownership
sudo chown -R api-user:api-user /var/www/api
sudo chown -R frontend-user:frontend-user /var/www/frontend
sudo chown -R admin-user:admin-user /var/www/admin
```

Update `oxfile.toml` to run each process as its user:

```toml
[processes.api]
command = "node dist/server.js"
working_dir = "/var/www/api"
user = "api-user"
...

[processes.frontend]
command = "node .output/server/index.mjs"
working_dir = "/var/www/frontend"
user = "frontend-user"
...
```

## Step 6: Per-App Deploy Scripts

Each app needs its own deploy script:

```bash
# /var/www/api/deploy.sh
#!/bin/bash
set -euo pipefail

cd /var/www/api
git pull origin main
npm ci --omit=dev
npm run build
oxmgr reload api --config /etc/oxmgr/oxfile.toml
echo "API deployed successfully"
```

```bash
# /var/www/frontend/deploy.sh
#!/bin/bash
set -euo pipefail

cd /var/www/frontend
git pull origin main
npm ci --omit=dev
npm run build
oxmgr reload frontend --config /etc/oxmgr/oxfile.toml
echo "Frontend deployed successfully"
```

Deploy apps independently:

```bash
# Deploy only the API (doesn't touch frontend or admin)
sudo -u api-user /var/www/api/deploy.sh

# Deploy only the frontend
sudo -u frontend-user /var/www/frontend/deploy.sh
```

## Alternative: Path-Based Routing

If you only have one domain and want to serve multiple apps on paths:

```nginx
# mycompany.com → frontend
# mycompany.com/api → API
# mycompany.com/admin → admin panel

server {
    listen 443 ssl;
    server_name mycompany.com;

    location /api/ {
        proxy_pass http://localhost:3000/;  # note trailing slash
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /admin/ {
        proxy_pass http://localhost:3002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Optionally restrict to internal IPs:
        # allow 10.0.0.0/8;
        # deny all;
    }

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Note: path-based routing requires your apps to be aware of their base path. Configure `BASE_PATH=/api` in each app's environment and handle it in routing.

## Troubleshooting Common Issues

**Port already in use:**

```bash
# Find what's using a port
sudo ss -tlnp | grep :3000
sudo lsof -i :3000

# Kill it
sudo kill -9 <pid>
```

**Nginx 502 Bad Gateway:**

The app on the upstream port isn't responding. Check:

```bash
# Is the process running?
oxmgr status

# Is it listening on the right port?
ss -tlnp | grep node

# Can you reach it directly?
curl http://localhost:3000/health
```

**Apps interfering with each other:**

Check for shared resources: same Redis database, same log file path, same `/tmp` files. Use namespacing (different Redis key prefixes, different log directories).

**Out of memory on a small VPS:**

Calculate your memory budget before deploying:

```
512 MB VPS
- OS: ~150 MB
- Nginx: ~10 MB
- Oxmgr: ~4 MB
- Remaining for apps: ~348 MB

3 apps × 2 instances × ~60 MB each = 360 MB  ← too tight

Solution:
- Reduce to 1 instance each: 3 × 60 MB = 180 MB ✓
- Or upgrade to 1 GB VPS
```

## Quick Reference: Full Setup Commands

```bash
# 1. Install tools
npm install -g oxmgr
sudo apt install nginx certbot python3-certbot-nginx -y

# 2. Create app directories and users
sudo mkdir -p /var/www/{api,frontend,admin}
sudo adduser --system --group {api,frontend,admin}-user

# 3. Deploy app code
cd /var/www/api && sudo git clone <repo> .

# 4. Create central Oxmgr config
sudo nano /etc/oxmgr/oxfile.toml

# 5. Start all processes
sudo oxmgr start --config /etc/oxmgr/oxfile.toml

# 6. Configure Nginx
sudo nano /etc/nginx/sites-available/myapp
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. Add HTTPS
sudo certbot --nginx -d mycompany.com -d api.mycompany.com

# 8. Set up systemd for boot persistence
sudo systemctl enable oxmgr
sudo systemctl enable nginx
```

See the [deployment guide](/blog/how-to-deploy-nodejs-production) for a single-app setup, or the [Oxmgr docs](/docs) for full configuration reference.
