---
title: Deploying a Spring Boot JAR in Production — systemd vs a Process Manager
description: How to run a Spring Boot fat JAR in production — JVM heap and container-awareness flags, health via Actuator, graceful shutdown, and whether systemd or a process manager should supervise it.
date: 2026-08-19
tags: [spring-boot, java, jvm, production, process-manager, devops]
keywords: [spring boot production deployment, run spring boot jar production, spring boot systemd service, spring boot process manager, jvm heap production, spring boot actuator health, spring boot graceful shutdown]
author: Oxmgr Team
---

# Deploying a Spring Boot JAR in Production

A Spring Boot app builds to a single executable fat JAR, which makes deployment refreshingly simple: copy one file, run `java -jar`, done. The nuance is all in *how* you run it — JVM flags, health checks, graceful shutdown — and *what supervises it*. Here's a production-grade setup.

## Step 1: Build the JAR

```bash
./mvnw clean package -DskipTests
# or
./gradlew bootJar
```

You get `target/myapp-1.0.0.jar` (or `build/libs/...`). Run it:

```bash
java -jar myapp-1.0.0.jar
```

That works, but naked `java -jar` in production leaves memory and health on the table. Fix both.

## Step 2: JVM flags that matter in production

The single most important thing on a VPS or container: **let the JVM see the real memory limit and size the heap as a percentage of it.**

```bash
java \
  -XX:MaxRAMPercentage=75.0 \
  -XX:InitialRAMPercentage=50.0 \
  -XX:+UseG1GC \
  -XX:+ExitOnOutOfMemoryError \
  -jar myapp-1.0.0.jar
```

- **`MaxRAMPercentage=75`** sizes the heap to 75% of available RAM instead of the JVM's tiny default. Leave headroom (the other 25%) for metaspace, thread stacks, and off-heap — overshoot and the [OOM killer](/blog/linux-oom-killer-nodejs) takes you.
- **`ExitOnOutOfMemoryError`** turns a `OutOfMemoryError` into a clean process exit, so your supervisor can *restart* it rather than leaving a half-dead JVM limping. This pairs perfectly with a process manager's [crash recovery](/blog/what-is-crash-recovery).
- **G1GC** is a sensible default for most server workloads.

## Step 3: Health via Actuator

Add Actuator and expose a liveness/readiness endpoint:

```
management.endpoint.health.probes.enabled=true
management.endpoints.web.exposure.include=health
```

Now `/actuator/health/readiness` and `/actuator/health/liveness` exist — ideal for a [readiness health check](/blog/nodejs-health-checks) that gates reloads and for a reverse proxy to route on.

## Step 4: Graceful shutdown

Spring Boot supports graceful shutdown natively — turn it on so in-flight requests finish before the JVM dies:

```
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

Your supervisor must send `SIGTERM` (not `SIGKILL`) and wait. The pattern is exactly the [Node graceful shutdown story](/blog/nodejs-graceful-shutdown-complete-guide) — stop accepting new work, drain, then exit.

## systemd vs a process manager

For a *single* JVM on a box, plain systemd is a perfectly good answer:

```ini
[Service]
ExecStart=/usr/bin/java -XX:MaxRAMPercentage=75 -jar /srv/app/myapp.jar
Restart=always
SuccessExitStatus=143   # 128+SIGTERM, so graceful stop isn't logged as failure
TimeoutStopSec=35
```

Use a **process manager instead when** you have more than one service, want [config in git](/blog/oxfile-toml-complete-guide) rather than scattered unit files, want health-gated [zero-downtime reloads](/blog/zero-downtime-deployment), or want a unified [event stream](/blog/process-manager-event-bus) across a mixed-language stack. A Java API, a [Node frontend](/blog/sveltekit-self-hosting), and a Python worker under one supervisor with one dashboard beats three different init mechanisms.

With [Oxmgr](/blog/introducing-oxmgr):

```toml
[processes.api]
command = "java -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -jar /srv/app/myapp.jar"
restart_on_exit = true
stop_signal = "SIGTERM"
stop_timeout_ms = 35000

[processes.api.env]
SPRING_PROFILES_ACTIVE = "production"

[processes.api.health_check]
endpoint = "http://localhost:8080/actuator/health/readiness"
interval_secs = 30
```

The `stop_timeout_ms` matches your `timeout-per-shutdown-phase` so Oxmgr waits for the drain instead of killing mid-request.

## A note on startup time

JVM apps start slower than the [millisecond crash recovery](/blog/what-is-crash-recovery) of a native binary — a real Spring Boot app is often 5–20 seconds to ready. That makes two things important: a **readiness** check (so the proxy doesn't route until the context is up), and, if cold-start matters, exploring **AOT/CDS** (`-XX:+AutoCreateSharedArchive`) or GraalVM native image to cut it dramatically. The supervisor's job is to *wait for readiness*, which is why a health-gated reload matters more for Java than for fast-booting runtimes.

## Recap

Build the fat JAR, run it with `MaxRAMPercentage` + `ExitOnOutOfMemoryError`, expose Actuator health, enable graceful shutdown, and supervise it — systemd for one service, a process manager once you have a stack. The JAR makes deployment a one-file copy; the flags and the supervisor make it *reliable*.
