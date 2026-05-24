---
title: FastAPI in Production — Uvicorn, Gunicorn, and Who Watches the Workers
description: FastAPI is fast. The production setup around it — Uvicorn, Gunicorn, worker counts, supervision — is where most teams get stuck. Here's the working answer.
date: 2026-06-18
tags: [fastapi, python, uvicorn, gunicorn, production, process-manager]
keywords: [fastapi production, fastapi uvicorn gunicorn, fastapi process manager, fastapi systemd, fastapi deployment, fastapi workers, deploy fastapi vps, fastapi graceful shutdown]
author: Oxmgr Team
---

# FastAPI in Production

FastAPI is the framework. Uvicorn is the ASGI server. Gunicorn is the process manager for Uvicorn workers. Some supervisor is the process manager for Gunicorn itself. If that stack makes you tired before you've deployed anything, you're not alone — this post is the working answer.

## The Layer Diagram

From top to bottom on a production box:

1. **Reverse proxy** (Caddy/nginx) — TLS, gzip, rate limits.
2. **Gunicorn** — spawns N worker processes, restarts dead ones.
3. **Uvicorn workers** — one Python process each, runs your FastAPI app.
4. **Supervisor** (systemd / Oxmgr) — keeps Gunicorn itself alive.

Yes, you need two layers of supervision. Gunicorn watches its workers. Something watches Gunicorn. If Gunicorn itself dies, no one is left to restart the workers.

## Why Gunicorn?

You can run Uvicorn directly:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

That's a single process. One CPU core. No worker restarts. Fine for development, not for production.

You can also run Uvicorn with built-in workers:

```bash
uvicorn app.main:app --workers 4 --host 127.0.0.1 --port 8000
```

This works but the worker-management story is thin. Gunicorn has been doing this for 15 years and the failure modes are well-trodden.

The production command:

```bash
gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 \
  --bind 127.0.0.1:8000 \
  --timeout 60 \
  --graceful-timeout 30 \
  --keep-alive 5 \
  --access-logfile - \
  --error-logfile -
```

That's what your supervisor needs to keep alive.

## How Many Workers?

The classic Gunicorn rule is `(2 × CPU) + 1`. For async workloads (FastAPI is async-by-default), that's often too many — each async worker can handle hundreds of concurrent requests on its own.

A more useful starting point:

- **CPU-bound workload** (ML inference, JSON crunching): `workers = CPU cores`.
- **I/O-bound workload** (DB queries, HTTP calls): `workers = CPU cores`, but with high `--worker-connections`.
- **Mixed**: `workers = (CPU cores) + 1`, measure, adjust.

The reason to err lower than `2N+1`: every worker is a full Python interpreter with its own memory footprint, its own DB connection pool, and its own copy of your app. On a 2 GB VPS, 8 workers of a moderately heavy FastAPI app will OOM before they're useful.

## Supervision

Two options, same shape as everything else.

**systemd:**

```ini
# /etc/systemd/system/myapi.service
[Unit]
Description=My FastAPI service
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/myapi
EnvironmentFile=/srv/myapi/.env
ExecStart=/srv/myapi/.venv/bin/gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 \
  --bind 127.0.0.1:8000 \
  --timeout 60 \
  --graceful-timeout 30
Restart=on-failure
RestartSec=2
TimeoutStopSec=45
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

**[Oxmgr](https://oxmgr.empellio.com):**

```toml
# oxfile.toml
[processes.api]
command = "./.venv/bin/gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers 4 --bind 127.0.0.1:8000 --timeout 60 --graceful-timeout 30"
cwd = "/srv/myapi"
env_file = ".env"
restart = "on-failure"
stop_signal = "SIGTERM"
stop_timeout = "45s"

[processes.api.health]
type = "http"
url = "http://127.0.0.1:8000/health"
interval = "10s"

[processes.api.limits]
memory = "1G"
```

For a comparison of process managers across languages, see the [Python process manager guide](/blog/python-process-manager-production).

## Graceful Shutdown — Two Layers of It

Gunicorn handles the worker side: on `SIGTERM`, it stops accepting new connections, sends `SIGTERM` to workers, and waits up to `--graceful-timeout` for them to finish their current requests.

FastAPI handles the app side via lifespan events:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.db = await create_pool()
    yield
    # shutdown
    await app.state.db.close()

app = FastAPI(lifespan=lifespan)
```

The `lifespan` shutdown block runs when Uvicorn signals the app to shut down. This is where DB pools close, background tasks cancel, and message queues unsubscribe.

The supervisor sends `SIGTERM` → Gunicorn stops accepting connections → Uvicorn workers drain → FastAPI `lifespan` shutdown runs. If your supervisor's `stop_timeout` is shorter than Gunicorn's `graceful-timeout`, the supervisor wins and you lose in-flight requests. Make sure supervisor timeout > Gunicorn timeout + a few seconds.

The general pattern is in the [graceful shutdown guide](/blog/nodejs-graceful-shutdown-complete-guide) — language differs, lifecycle is the same.

## Health Endpoint

```python
from fastapi import FastAPI, Response

@app.get("/health")
async def health():
    return Response(status_code=200, content="ok")

@app.get("/ready")
async def ready(db = Depends(get_db)):
    try:
        await db.execute("SELECT 1")
        return Response(status_code=200, content="ready")
    except Exception:
        return Response(status_code=503, content="not ready")
```

Same split as in the [health check post](/blog/nodejs-health-checks): `/health` is liveness (process alive and responsive), `/ready` is readiness (dependencies up). Your supervisor watches `/health`; your reverse proxy or load balancer watches `/ready`.

## Reverse Proxy

Caddy:

```caddyfile
api.example.com {
    reverse_proxy 127.0.0.1:8000 {
        health_uri /ready
        health_interval 10s
    }
}
```

Caddy will stop routing to the upstream if `/ready` fails. nginx works similarly; the [Node.js VPS setup post](/blog/nodejs-vps-setup-nginx-ssl) has a complete nginx config you can adapt.

## Memory and the Async-Worker Gotcha

A single Uvicorn worker handling 1,000 concurrent requests will hold all 1,000 request bodies in memory until the responses are sent. If your endpoints accept large uploads, that adds up fast.

Mitigations:

- Stream uploads with `UploadFile` instead of buffering.
- Set a body size limit at the proxy layer.
- Cap memory at the supervisor level so a runaway worker is killed cleanly.

The patterns from the [resource limits guide](/blog/nodejs-resource-limits-production) apply directly — replace "Node process" with "Gunicorn worker."

## Logging

Two streams to capture:

- **Access logs** — every request. Useful for debugging traffic, easy to noise out important signals.
- **Error logs** — exceptions and stack traces.

Gunicorn writes both to stdout/stderr by default. Let your supervisor capture and rotate them. Don't write to files from Python — you'll race with the supervisor on rotation. The full pattern is in the [log management guide](/blog/nodejs-log-management).

For structured JSON logs (helpful in production), use `structlog`:

```python
import structlog
logger = structlog.get_logger()

@app.get("/items/{item_id}")
async def get_item(item_id: int):
    logger.info("item_fetch", item_id=item_id)
    return {"id": item_id}
```

## Deploys

The Python deploy story is messier than Node because of the virtualenv. Two clean options:

**Option A: Build wheels in CI, ship them.**

```bash
pip wheel --wheel-dir=wheels -r requirements.txt
rsync -az wheels/ deploy@vps:/srv/myapi/wheels/
ssh deploy@vps '.venv/bin/pip install --no-index --find-links=wheels -r requirements.txt'
```

**Option B: Build the whole venv in CI matching the production Python version, ship it.**

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
tar czf venv.tar.gz .venv
# ship and unpack on server
```

Option B is faster to deploy but only works if your CI Python matches your prod Python exactly (same minor version, same platform, same arch).

After unpacking the new code, reload the supervisor:

```bash
oxm reload api
# or
systemctl reload myapi
```

Gunicorn supports `HUP` for graceful worker reloads — but that doesn't help if your dependencies changed. For dep changes, a full restart is correct.

For automated webhook deploys, see [git webhook auto-deploy](/blog/git-webhook-auto-deploy-nodejs).

## Common Pitfalls

- **Running `uvicorn` directly in production.** No worker management. Fine for dev, wrong for prod.
- **`workers = 2 * CPU + 1` for I/O-bound async code.** You'll burn RAM for no throughput gain.
- **Supervisor timeout shorter than `--graceful-timeout`.** Truncated responses on every deploy.
- **Sync DB calls in async endpoints.** Blocks the event loop. Use the async DB driver (asyncpg, aiomysql) or `run_in_executor`.
- **Forgetting the `lifespan` shutdown handler.** Connection leaks on every deploy.

## Bottom Line

FastAPI in production is Gunicorn-as-worker-manager plus a real supervisor on top. The async model means fewer workers than you'd think; the lifespan model means cleanup is your responsibility, not the framework's.

If you want a single supervisor that watches Gunicorn, your worker queue, and your cron jobs from one config file, [Oxmgr](https://oxmgr.empellio.com) installs in under a minute and handles Python services as cleanly as Node ones.
