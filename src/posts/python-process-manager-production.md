---
title: Python Process Manager in Production — FastAPI, Django, and Flask
description: How to manage Python web apps in production without Gunicorn complexity. Using Oxmgr to run FastAPI, Django, and Flask processes with automatic restarts, health checks, and zero-downtime deploys.
date: 2026-04-21
tags: [python, fastapi, django, flask, process-manager, production, devops]
keywords: [python process manager, fastapi production server, django production deployment, flask production process manager, run python app production, python gunicorn alternative, fastapi process manager, python web app deployment linux]
author: Oxmgr Team
---

Oxmgr isn't just for Node.js. It manages any process — which means it's equally useful for Python web apps running FastAPI, Django, or Flask.

This guide covers running Python web applications in production with Oxmgr: process management, health checks, zero-downtime deploys, and multi-service coordination.

## The Problem with the Standard Python Stack

The "standard" production setup for a Python web app looks like this:

```
Nginx → Gunicorn → Django/Flask/FastAPI workers
```

This works, but requires:
- Nginx configuration for proxying
- Gunicorn config file or CLI flags (memorized or scripted)
- Supervisor or systemd to keep Gunicorn alive
- Separate tooling if you have background workers or schedulers

Oxmgr replaces the process management layer entirely — Gunicorn, Supervisor, and the systemd service file — with a single `oxfile.toml`.

## FastAPI with Uvicorn

FastAPI apps run on ASGI servers. Uvicorn is the standard:

**Install:**
```bash
pip install fastapi uvicorn
```

**Minimal oxfile.toml:**
```toml
[processes.api]
command = "uvicorn main:app --host 0.0.0.0 --port 8000"
restart_on_exit = true
```

**Production config — multiple workers:**

Uvicorn's `--workers` flag forks multiple processes. Alternatively, run separate Oxmgr instances and load-balance:

```toml
[processes.api]
command = "uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4"
restart_on_exit = true
restart_delay_ms = 2000
max_restarts = 15

[processes.api.env]
PYTHONPATH = "/var/www/myapp"
DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/myapp"
SECRET_KEY = "your-secret-key"

[processes.api.health_check]
endpoint = "http://localhost:8000/health"
interval_secs = 30
initial_delay_secs = 10
unhealthy_threshold = 3
```

**Health check endpoint in FastAPI:**

```python
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine
import time

app = FastAPI()
engine = create_async_engine(settings.DATABASE_URL)
start_time = time.time()

@app.get("/health")
async def health():
    checks = {}
    healthy = True

    # Check database
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {str(e)}"
        healthy = False

    return {
        "status": "ok" if healthy else "degraded",
        "uptime": time.time() - start_time,
        "checks": checks
    }

if not healthy:
    from fastapi import Response
    return Response(content=..., status_code=503)
```

Cleaner with a proper status code:

```python
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import time

app = FastAPI()
start_time = time.time()

@app.get("/health")
async def health():
    healthy = True
    checks = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = str(e)
        healthy = False

    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "degraded",
            "uptime_seconds": round(time.time() - start_time),
            "checks": checks
        }
    )
```

## Django with Gunicorn

```bash
pip install django gunicorn
```

```toml
[processes.web]
command = "gunicorn myproject.wsgi:application --bind 0.0.0.0:8000 --workers 4 --worker-class gthread --threads 2 --timeout 30"
working_dir = "/var/www/myproject"
restart_on_exit = true
restart_delay_ms = 3000
max_restarts = 10

[processes.web.env]
DJANGO_SETTINGS_MODULE = "myproject.settings.production"
PYTHONPATH = "/var/www/myproject"

[processes.web.health_check]
endpoint = "http://localhost:8000/health/"
interval_secs = 30
initial_delay_secs = 20
unhealthy_threshold = 3
```

Django health check view:

```python
# urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health'),
    # ...
]
```

```python
# views.py
from django.http import JsonResponse
from django.db import connection, OperationalError
import time

_start_time = time.time()

def health_check(request):
    checks = {}
    healthy = True

    # Check database
    try:
        connection.ensure_connection()
        checks['database'] = 'ok'
    except OperationalError as e:
        checks['database'] = str(e)
        healthy = False

    # Check Django cache (if configured)
    try:
        from django.core.cache import cache
        cache.set('health_check', 'ok', timeout=5)
        assert cache.get('health_check') == 'ok'
        checks['cache'] = 'ok'
    except Exception as e:
        checks['cache'] = str(e)
        # Decide if cache failure = unhealthy

    return JsonResponse(
        {
            'status': 'ok' if healthy else 'degraded',
            'uptime_seconds': round(time.time() - _start_time),
            'checks': checks,
        },
        status=200 if healthy else 503
    )
```

## Flask with Gunicorn

```bash
pip install flask gunicorn
```

```toml
[processes.app]
command = "gunicorn app:app --bind 0.0.0.0:5000 --workers 3"
working_dir = "/var/www/flaskapp"
restart_on_exit = true
max_restarts = 10

[processes.app.env]
FLASK_ENV = "production"
SECRET_KEY = "your-secret-key"
DATABASE_URL = "postgresql://user:pass@localhost/mydb"

[processes.app.health_check]
endpoint = "http://localhost:5000/health"
interval_secs = 30
initial_delay_secs = 5
```

```python
# In your Flask app
from flask import Flask, jsonify
from sqlalchemy import text
import time

app = Flask(__name__)
start_time = time.time()

@app.route('/health')
def health():
    checks = {}
    healthy = True

    try:
        db.session.execute(text('SELECT 1'))
        checks['database'] = 'ok'
    except Exception as e:
        checks['database'] = str(e)
        healthy = False

    return jsonify({
        'status': 'ok' if healthy else 'degraded',
        'uptime': round(time.time() - start_time),
        'checks': checks
    }), 200 if healthy else 503
```

## Background Workers and Celery

Most Python apps have background workers alongside the web process. Manage both in one oxfile:

```toml
# Web API
[processes.web]
command = "uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2"
restart_on_exit = true

[processes.web.health_check]
endpoint = "http://localhost:8000/health"
interval_secs = 30


# Celery worker
[processes.celery-worker]
command = "celery -A tasks worker --loglevel=info --concurrency=4"
working_dir = "/var/www/myapp"
restart_on_exit = true
restart_delay_ms = 5000

[processes.celery-worker.env]
CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "redis://localhost:6379/1"


# Celery Beat scheduler
[processes.celery-beat]
command = "celery -A tasks beat --loglevel=info"
working_dir = "/var/www/myapp"
restart_on_exit = true
instances = 1   # always exactly 1 — multiple beat instances cause duplicate tasks
```

Start the whole stack:

```bash
oxmgr start
```

Check status:

```bash
oxmgr status
```

```
NAME            PID    STATUS    CPU    MEM      RESTARTS  UPTIME
web             22140  running   3.2%   210 MB   0         2d 6h
celery-worker   22151  running   1.8%   180 MB   0         2d 6h
celery-beat     22162  running   0.1%   95 MB    0         2d 6h
```

## Virtual Environments

Always use a virtual environment and reference the full path to the Python executable:

```toml
[processes.api]
command = "/var/www/myapp/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000"
```

Or activate the venv in the command:

```toml
[processes.api]
command = "bash -c 'source /var/www/myapp/venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000'"
```

The explicit path approach is cleaner and avoids shell activation edge cases.

## Zero-Downtime Deploys for Python Apps

Python apps restart slower than Node.js (no JIT warmup advantage, but cold Python is still fast). For FastAPI/Uvicorn:

```bash
# Deploy script
set -euo pipefail

cd /var/www/myapp

# Pull code
git pull origin main

# Update dependencies
/var/www/myapp/venv/bin/pip install -r requirements.txt --quiet

# Run migrations (Django)
/var/www/myapp/venv/bin/python manage.py migrate --noinput

# Rolling restart — Oxmgr handles zero-downtime
oxmgr reload web

echo "Deploy complete"
oxmgr status
```

Oxmgr's rolling restart starts the new instance, waits for it to pass health checks, then stops the old one. No downtime.

For Django migrations that can't run alongside the old code (breaking schema changes), use blue-green:

```bash
# Start green environment on different port
PORT=8001 oxmgr start --config oxfile.green.toml

# Wait for health
until curl -sf http://localhost:8001/health; do sleep 2; done

# Swap nginx upstream
sed -i 's/:8000/:8001/' /etc/nginx/conf.d/myapp.conf
nginx -s reload

# Stop old blue
oxmgr stop --config oxfile.blue.toml
```

## Resource Limits for Python

Python processes can leak memory, especially long-running workers. Set limits to contain leaks:

```toml
[processes.celery-worker.limits]
memory_mb = 512   # worker normally uses 180MB, 512MB = something went wrong
```

When memory exceeds the limit, Oxmgr restarts the worker cleanly — preventing the leak from taking down the whole server.

## Log Management

Gunicorn and Uvicorn write to stdout by default. Capture and rotate:

```toml
[processes.web]
command = "uvicorn main:app --host 0.0.0.0 --port 8000"
log_file = "/var/log/myapp/web.log"
error_log_file = "/var/log/myapp/web-error.log"

[processes.web.logs]
max_size_mb = 100
max_files = 7
compress = true
```

Or use Python's built-in logging and write structured JSON to stdout, letting Oxmgr capture it:

```python
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            'level': record.levelname.lower(),
            'msg': record.getMessage(),
            'ts': self.formatTime(record),
            'logger': record.name
        })

logging.basicConfig(handlers=[logging.StreamHandler()])
logging.getLogger().handlers[0].setFormatter(JSONFormatter())
```

## The Full oxfile.toml

A complete production oxfile for a FastAPI + Celery app:

```toml
[processes.web]
command = "/var/www/myapp/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4"
working_dir = "/var/www/myapp"
restart_on_exit = true
restart_delay_ms = 2000
max_restarts = 15
stop_timeout_ms = 30000

[processes.web.env]
DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/myapp"
REDIS_URL = "redis://localhost:6379"
SECRET_KEY = "your-production-secret"
ENVIRONMENT = "production"

[processes.web.health_check]
endpoint = "http://localhost:8000/health"
interval_secs = 30
initial_delay_secs = 15
unhealthy_threshold = 3
healthy_threshold = 2

[processes.web.limits]
memory_mb = 1024

[processes.web.logs]
max_size_mb = 200
max_files = 7
compress = true


[processes.worker]
command = "/var/www/myapp/venv/bin/celery -A tasks worker --loglevel=info --concurrency=4"
working_dir = "/var/www/myapp"
restart_on_exit = true
restart_delay_ms = 5000
max_restarts = 10

[processes.worker.env]
DATABASE_URL = "postgresql://user:pass@localhost/myapp"
CELERY_BROKER_URL = "redis://localhost:6379/0"

[processes.worker.limits]
memory_mb = 512


[processes.beat]
command = "/var/www/myapp/venv/bin/celery -A tasks beat --loglevel=info"
working_dir = "/var/www/myapp"
restart_on_exit = true
instances = 1

[processes.beat.env]
DATABASE_URL = "postgresql://user:pass@localhost/myapp"
CELERY_BROKER_URL = "redis://localhost:6379/0"
```

One file. One `oxmgr start`. Your entire Python production stack is running with health checks, resource limits, and automatic recovery.

See the [Oxfile reference](/blog/oxfile-toml-complete-guide) for all available configuration options.
