---
title: Do You Need Kubernetes? Running Production Apps on One VPS Instead
description: Kubernetes solves problems most apps don't have yet. Here's an honest look at what k8s gives you, what it costs, and how far a single well-managed VPS actually goes before you need any of it.
date: 2026-08-04
tags: [kubernetes, vps, self-hosting, process-manager, devops, architecture]
keywords: [do i need kubernetes, kubernetes vs vps, kubernetes alternative small app, single server production, kubernetes overkill, when to use kubernetes, process manager instead of kubernetes]
author: Oxmgr Team
---

# Do You Need Kubernetes?

Kubernetes is genuinely good technology solving genuinely hard problems. The trouble is that most teams adopt it for problems they don't have yet, and pay the operational tax for years before — if ever — those problems arrive. Before you write a single YAML manifest, it's worth asking honestly what k8s buys you and whether one VPS would carry you further than you think.

## What Kubernetes actually gives you

Strip away the hype and k8s provides four real things:

1. **Multi-node scheduling** — placing containers across many machines automatically.
2. **Self-healing across a fleet** — if a *node* dies, work reschedules elsewhere.
3. **Declarative rollouts** — rolling updates, health-gated, with automatic rollback.
4. **Horizontal autoscaling** — add replicas under load, remove them after.

Every one of these matters *at a certain scale*. The question is whether you're at that scale.

## What it costs you

The bill isn't just the control plane's compute:

- **Cognitive load.** Pods, services, ingress, deployments, config maps, secrets, RBAC, network policies, storage classes. That's a lot of surface before "hello world" serves traffic.
- **A YAML supply chain.** Helm charts, kustomize overlays, a GitOps controller. Real infrastructure to maintain the infrastructure.
- **Debugging distance.** A crash is now behind `kubectl logs`, pod restarts, and eviction events instead of a process on a box you can `htop`.
- **Baseline resource overhead.** The control plane and per-node agents consume CPU and RAM whether or not you have traffic.

For a large team running hundreds of services, this tax is worth it. For a solo founder or a small team with a handful of services, it's often pure overhead — you're operating a distributed system to run software that fits on one machine.

## How far one VPS actually goes

People wildly underestimate a single modern server. A $20–40/month VPS with 4–8 cores and 8–16 GB RAM can comfortably run:

- A web app across [all cores via clustering](/blog/nodejs-clustering-multi-core) or multiple instances
- Background [workers](/blog/bullmq-workers-production) and a scheduler
- [Postgres or SQLite](/blog/sqlite-in-production-small-apps)
- A [reverse proxy with SSL](/blog/nodejs-vps-setup-nginx-ssl)
- Tens of thousands of concurrent [WebSocket connections](/blog/websocket-server-scaling-vps)

That's a complete production stack, and it's boring in the best way: you can SSH in, read a log, restart a process, and understand the whole system in your head.

## The piece you still need: supervision

The one thing k8s does that you *can't* skip on a single box is **keep processes alive and roll out new versions safely**. That's not a Kubernetes feature — it's a *supervision* feature that k8s happens to bundle. On one VPS, a process manager provides the same guarantees without the cluster:

| Kubernetes concept | Single-VPS equivalent |
|---|---|
| Deployment keeps N replicas | `instances = 4` in your config |
| liveness/readiness probes | [health checks](/blog/nodejs-health-checks) |
| Rolling update | [zero-downtime reload](/blog/zero-downtime-deployment) |
| Auto-restart on crash | [crash recovery](/blog/what-is-crash-recovery) |
| `kubectl get pods` | `oxmgr ls --json` |
| Resource requests/limits | [resource limits](/blog/nodejs-resource-limits-production) |

With [Oxmgr](/blog/introducing-oxmgr) that's an `oxfile.toml` and `oxmgr start` — you get replicas, health-gated rollouts, crash recovery, and limits, on one machine, in a few megabytes.

## The honest decision tree

You probably **don't** need Kubernetes if:

- Your app fits on one server (most apps, for a long time)
- You have a handful of services, not dozens of teams
- Downtime for a reboot is measured in seconds and is acceptable
- Nobody on the team already runs k8s well

You probably **do** need it (or a managed equivalent) when:

- You genuinely outgrow the biggest single machine you can rent
- You need multi-node failover because one server dying is unacceptable
- You have enough services and teams that manual placement is the bottleneck
- You have the headcount to operate it properly

## A sane migration path

The best part of starting on one VPS is that you don't paint yourself into a corner. A clean [12-factor app](/blog/nodejs-environment-variables-production) with stateless processes, health checks, and config in the environment is *already* Kubernetes-ready. If you outgrow the box, you containerize and lift it into k8s then — with real scaling data instead of a guess.

Start simple. One VPS, a process manager, a reverse proxy. Add complexity when a metric — not a blog post — tells you to. You'll ship faster for years, and if the day comes when you truly need Kubernetes, you'll know, because something specific will hurt.
