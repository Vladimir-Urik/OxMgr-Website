---
title: Node.js in Docker vs Process Manager — When to Use Each
description: Should you run Node.js in Docker or use a process manager like PM2 or Oxmgr directly? Here's an honest comparison of both approaches with real trade-offs, not dogma.
date: 2026-04-09
tags: [node.js, docker, process-manager, deployment, devops, containers]
keywords: [node.js docker vs pm2, docker vs process manager node.js, node.js in docker, pm2 inside docker, docker node.js production, node.js container vs process manager, docker or pm2 node.js, nodejs docker production]
author: Oxmgr Team
---

# Node.js in Docker vs Process Manager — When to Use Each

Both approaches keep Node.js apps running in production. They're not mutually exclusive, but they have different trade-offs. Here's how to choose — and how to combine them when that makes sense. If you're not sure what a process manager does at a basic level, [What Is a Process Manager?](/blog/what-is-a-process-manager) is the right starting point.

## What Each Approach Actually Does

**Running with a process manager (Oxmgr, PM2, systemd)** means your Node.js process runs directly on the host OS. The process manager handles crash recovery, clustering, log management, and deploy coordination.

**Running in Docker** means your Node.js process runs inside a container — an isolated environment with its own filesystem, networking, and process namespace. Docker (or the container runtime) handles the container lifecycle. You still need something inside the container to manage the Node.js process.

Key insight: **Docker and process managers solve different problems**. Docker solves environment consistency and isolation. Process managers solve Node.js-specific application lifecycle management (clustering, health checks, rolling restarts).

## Case for Running Directly (Process Manager Only)

### When it makes sense

- **Solo developer or small team** — no need for container orchestration overhead
- **Single server deployment** — you know exactly what's on the server
- **Simple apps** — one or two Node.js services, not a microservices mesh
- **Resource-constrained servers** — Docker daemon adds memory and CPU overhead
- **Rapid iteration** — deploy in seconds without building/pushing images

### What it looks like

```toml
# oxfile.toml — your entire production config
[processes.api]
command = "node dist/server.js"
instances = 4
restart_on_exit = true
env = { NODE_ENV = "production", PORT = "3000" }
env_file = ".env.production"

[processes.api.health_check]
endpoint = "http://localhost:3000/health"
interval_secs = 10
```

```bash
# Deploy in 10 seconds
git pull && npm run build && oxmgr reload
```

### Advantages

- **Simpler mental model** — one layer instead of two
- **Faster deploys** — no image build/push/pull step
- **Lower overhead** — no Docker daemon (~200 MB+ RAM), no container network stack
- **Easier debugging** — logs and processes are right there on the host
- **Cluster mode is trivial** — `instances = max` in oxfile.toml vs complex Docker Swarm or K8s setup for clustering

### Limitations

- **Environment drift** — "works on my machine" is possible if dev and prod environments diverge
- **Dependency management** — Node.js version, native modules, system libraries must be managed manually
- **Harder to scale horizontally** — adding more servers means manually configuring each one
- **No isolation between apps** — apps share the host OS resources directly

## Case for Docker

### When it makes sense

- **Multiple developers** who need identical environments
- **Multiple services** that need isolation from each other
- **CI/CD pipeline** that already builds Docker images
- **Kubernetes or ECS deployment** — containers are the required unit
- **Complex dependencies** — native modules, specific OS packages, multiple runtime versions
- **Enterprise environment** — Docker is the standard deployment format

### What it looks like

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml
services:
  api:
    build: .
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file: .env.production
    ports:
      - "127.0.0.1:3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
```

### Advantages

- **Reproducible builds** — same image everywhere (dev, CI, staging, prod)
- **Isolation** — apps can't interfere with each other or the host OS
- **Portability** — move to any server running Docker without reconfiguring
- **Rollback** — `docker pull myapp:previous-version` is instant
- **Kubernetes ready** — containers are the native unit for K8s, ECS, etc.

### Limitations

- **More complexity** — Dockerfile, image registry, compose/K8s config on top of your app
- **Slower deploys** — build image, push to registry, pull on server, restart containers
- **More overhead** — Docker daemon, container network stack, image layers
- **Clustering is harder** — Docker doesn't give you PM2-style cluster mode out of the box; you need multiple container replicas

## The Cluster Problem in Docker

This is where process managers have a clear advantage. Running multiple Node.js workers inside Docker isn't straightforward:

**Option A: Run PM2 or Oxmgr inside Docker**

```dockerfile
FROM node:20-alpine
RUN npm install -g oxmgr
WORKDIR /app
COPY . .
RUN npm ci --omit=dev && npm run build
CMD ["oxmgr", "start", "--foreground"]
```

```toml
# oxfile.toml (included in image)
[processes.api]
command = "node dist/server.js"
instances = 4
restart_on_exit = true
```

This works, but you now have both Docker and Oxmgr managing processes. Docker handles the container lifecycle; Oxmgr handles the Node.js worker lifecycle inside the container.

**Option B: Run multiple Docker replicas**

```yaml
# docker-compose.yml
services:
  api:
    image: myapp:latest
    deploy:
      replicas: 4    # 4 containers, each with 1 Node.js process
```

This is the "Docker way" — scale by adding containers, not by using Node.js cluster. Works well with Docker Swarm or Kubernetes, but requires a load balancer in front.

**Option C: Single container with Node.js cluster module**

```javascript
// server.js — handles clustering internally
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';

if (cluster.isPrimary) {
  for (let i = 0; i < availableParallelism(); i++) cluster.fork();
  cluster.on('exit', () => cluster.fork());
} else {
  // your app code
  app.listen(3000);
}
```

```dockerfile
CMD ["node", "server.js"]   # Docker runs this, Node.js handles clustering
```

This is the simplest approach if you're committed to Docker and need multiple workers.

## Recommended Setups by Scenario

### Solo dev, simple app, single VPS

**Use Oxmgr directly.** No containers, no overhead, deploy in seconds.

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
instances = 2
restart_on_exit = true
```

### Small team, one or two services

**Use Oxmgr or PM2 directly** unless the team has a strong reason to standardize on Docker. The complexity of Docker CI/CD pipelines isn't worth it at this scale.

### Team with mixed tech stack (Node + Python + Go)

**Use Docker.** Each service brings its own runtime. Docker compose handles the multi-service setup cleanly.

```yaml
services:
  api:
    build: ./api         # Node.js
  worker:
    build: ./worker      # Python
  gateway:
    build: ./gateway     # Go
```

### Growing startup, CI/CD pipeline exists

**Use Docker with Oxmgr or cluster module inside containers.** Build images in CI, push to registry, deploy by pulling on servers.

```bash
# CI pipeline
docker build -t myapp:$GIT_SHA .
docker push registry/myapp:$GIT_SHA

# Deploy to server
ssh server "docker pull registry/myapp:$GIT_SHA && docker-compose up -d"
```

### Enterprise, Kubernetes

**Docker is non-negotiable** — K8s requires containers. Use K8s for process lifecycle (liveness/readiness probes, replica sets, rolling updates). You probably don't need a process manager inside the container.

```yaml
# k8s deployment.yaml
spec:
  replicas: 4
  template:
    spec:
      containers:
        - name: api
          image: myapp:latest
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            periodSeconds: 30
```

## Common Anti-Patterns

**Running PM2 inside Docker on Kubernetes:** Three layers of process management — K8s, Docker, PM2. Each has its own restart logic and health check mechanism. They fight each other. Pick one.

**Using Docker Compose in production for multi-replica setups:** Compose is great for local dev and simple single-server production. For true horizontal scaling, use Docker Swarm or Kubernetes.

**Not implementing graceful shutdown in Docker:** Docker sends SIGTERM before SIGKILL. Your app must handle SIGTERM. If it doesn't, `docker stop` kills it forcefully after a 10-second timeout.

```javascript
// Required in containerized apps
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
```

## Quick Decision Guide

```
Do you need containers for your team/CI/deployment platform?
    Yes → Docker + (K8s replicas or Oxmgr inside container)
    No  ↓

Are you running on a single server with limited resources?
    Yes → Oxmgr directly (lowest overhead)
    No  ↓

Do you have multiple services with different runtimes?
    Yes → Docker Compose
    No  → Oxmgr directly
```

## Summary

- **Process manager only (Oxmgr):** Best for small teams, simple setups, resource-constrained servers. Lowest overhead, fastest deploys, best clustering ergonomics.
- **Docker without a process manager inside:** Best for K8s/ECS deployments. Let the orchestrator handle replicas and restarts.
- **Docker + Oxmgr inside:** When you need both image-based deployments and cluster mode with health-check-gated rolling restarts in a single container.
- **Avoid:** PM2 inside K8s pods — redundant process management.

Install Oxmgr:

```bash
npm install -g oxmgr
```

See the [deployment guide](/blog/how-to-deploy-nodejs-production) for the direct server setup, or the [multiple apps guide](/blog/run-multiple-nodejs-apps-one-server) if you're hosting several services on one machine.
