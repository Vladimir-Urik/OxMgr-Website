---
title: Why Your Node.js App Keeps Crashing (And How to Fix It for Good)
description: Node.js crashes are almost always caused by unhandled promise rejections, out-of-memory errors, or missing error handling. Here's how to diagnose the exact cause and stop the crashes permanently.
date: 2026-03-28
tags: [node.js, debugging, crashes, production, reliability]
keywords: [node.js keeps crashing, node.js app crashing, why does node.js crash, node.js crash fix, node.js unhandled promise rejection, node.js out of memory crash, node.js process dies, node.js production crashes, fix node.js crash]
author: Oxmgr Team
---

# Why Your Node.js App Keeps Crashing

Your app is running, something happens, the process dies. The logs show nothing useful. Fifteen minutes later it crashes again. You're losing sleep over it.

Node.js crashes almost always fall into one of five categories. Here's how to identify which one you're dealing with and fix it.

## Step 1: Actually Read the Exit Code

Before anything else, check how the process is exiting. The exit code tells you a lot.

```bash
# If using Oxmgr
oxmgr logs api --lines 100 | grep "exit"

# If using PM2
pm2 logs api --lines 100 | grep "exit\|crash\|error"

# If running directly
node server.js; echo "Exit code: $?"
```

| Exit code | Meaning |
|-----------|---------|
| `0` | Clean exit — something intentionally called `process.exit(0)` |
| `1` | Uncaught exception or `process.exit(1)` |
| `137` | Killed by OS — usually OOM (out of memory) |
| `143` | SIGTERM — someone/something sent a stop signal |
| `null` / signal | Killed by a signal (SIGKILL = 9, SEGFAULT = 11) |

Exit code **137** means the OS killed your process because it ran out of memory. That's a memory leak, not a bug in your app logic. Exit code **1** with nothing in logs is almost always an unhandled exception. Exit code **143** means your process manager or deployment script is killing it intentionally.

## Cause #1: Unhandled Promise Rejections

The most common cause in modern Node.js. A promise rejects, nothing catches it, the process crashes.

```javascript
// This crashes the process in Node.js 15+
async function fetchData() {
  const result = await db.query('SELECT * FROM missing_table'); // throws
  return result;
}

fetchData(); // no await, no .catch() — rejection is unhandled
```

**How to detect it:**

```bash
# In your logs, look for:
# UnhandledPromiseRejectionWarning
# UnhandledPromiseRejection
node server.js 2>&1 | grep -i "unhandled\|rejection"
```

**How to fix it:**

Add a global handler to log unhandled rejections before they crash the process:

```javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);
  console.error('Promise:', promise);
  // Don't exit here — let your process manager restart cleanly
  // But do log so you can find and fix the actual bug
});
```

Then systematically find and fix the root cause. Search your codebase for async calls without try/catch or `.catch()`:

```bash
# Find async functions that might miss error handling
grep -rn "async\s" src/ --include="*.js" | head -30
```

Better: use ESLint rule `@typescript-eslint/no-floating-promises` to catch these at compile time.

## Cause #2: Uncaught Exceptions

Synchronous errors that nothing catches:

```javascript
// Crashes immediately
const data = JSON.parse('invalid json'); // SyntaxError, uncaught
```

**How to detect:** `Error: <message>` followed by a stack trace, then the process exits.

**How to fix:**

```javascript
// Global handler — log it, then exit gracefully
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);

  // IMPORTANT: After an uncaught exception, the process is in
  // an undefined state. Exit and let the process manager restart.
  process.exit(1);
});
```

And fix the actual bug — find the synchronous throw that nothing handles.

## Cause #3: Out of Memory (Exit Code 137)

Exit code 137 means the Linux OOM killer ended your process. Your app was using too much memory.

**Confirm it:**

```bash
# Check system logs for OOM kills
sudo dmesg | grep -i "out of memory\|oom\|killed process"
sudo journalctl -k | grep -i "oom\|out of memory"
```

You'll see something like:
```
kernel: Out of memory: Kill process 12847 (node) score 847 or sacrifice child
kernel: Killed process 12847 (node) total-vm:1234567kB, anon-rss:987654kB
```

**Immediate fix — set a memory limit so the process manager restarts it before the OOM killer does:**

```toml
# oxfile.toml
[processes.api.resource_limits]
max_memory_mb = 512
```

This is not the real fix — the real fix is finding and fixing the memory leak. But it prevents the OOM killer (which gives no warning) from killing your process and gives Oxmgr time to do a clean restart.

See the [memory leak guide](/blog/nodejs-memory-leaks-production) for finding the root cause.

## Cause #4: Syntax or Module Errors at Startup

Your app crashes before it even starts serving requests.

```bash
# Typical output:
SyntaxError: Unexpected token '}'
    at wrapSafe (internal/modules/cjs/loader.js:915:16)
    ...
```

**How to detect:** The process exits immediately after starting, usually with exit code 1. Logs show a stack trace pointing to a file.

**How to fix:** Run the app manually to see the full error:

```bash
node dist/server.js 2>&1 | head -30
```

Most common causes:
- Syntax error in edited file
- Missing required environment variable
- Required module not installed (`npm install` wasn't run after `package.json` change)
- Import path typo

## Cause #5: External Dependency Failure

Your app crashes because a database, Redis, or external API it depends on is unavailable, and the connection attempt throws an unhandled error.

```javascript
// Crashes if database is down at startup
const pool = new Pool({ connectionString: DATABASE_URL });
await pool.query('SELECT 1'); // throws if DB unreachable — unhandled
```

**How to fix:** Add startup dependency checks with retries:

```javascript
async function waitForDatabase(pool, maxAttempts = 10) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connected');
      return;
    } catch (err) {
      console.warn(`Database not ready (attempt ${i}/${maxAttempts}):`, err.message);
      if (i === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, 2000 * i)); // exponential backoff
    }
  }
}

// At startup:
await waitForDatabase(pool);
// Only then start the HTTP server
server.listen(3000);
```

This way, if the database is temporarily down, the app retries instead of crashing immediately.

## Debugging a Crash You Can't Reproduce Locally

Production crashes that don't happen locally are the hardest. Three techniques:

**1. Add structured error context to all handlers:**

```javascript
process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({
    type: 'uncaughtException',
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    uptime: process.uptime(),
  }));
  process.exit(1);
});
```

**2. Enable core dumps for segfaults:**

```bash
# Allow core dumps
ulimit -c unlimited

# Run your app
node --abort-on-uncaught-exception server.js

# Analyze the core dump with node-inspect or lldb
```

**3. Use `--trace-warnings` and `--trace-uncaught` flags:**

```bash
node --trace-warnings --trace-uncaught dist/server.js
```

This prints stack traces for warnings that would otherwise be silent.

## Stop the Bleeding While You Fix the Root Cause

While you're investigating, protect your users with automatic restart and memory limits:

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
instances = 2              # redundancy — other instance serves during restart
restart_on_exit = true
restart_delay_ms = 500     # brief delay to avoid crash loops
max_restarts = 20

[processes.api.resource_limits]
max_memory_mb = 512        # restart before OOM killer hits
```

With `instances = 2`, when one instance crashes, the other continues serving traffic during the 11ms restart window. Users won't notice.

## Crash Loop Detection

If your app crashes and restarts repeatedly (crash loop), Oxmgr stops after `max_restarts` attempts:

```toml
max_restarts = 10          # give up after 10 crashes
restart_window_secs = 60   # reset counter if stable for 60 seconds
```

You'll get a notification and the process stays down instead of grinding CPU spinning up and crashing repeatedly.

## Quick Diagnostic Checklist

When your app crashes, run through this:

```bash
# 1. What's the exit code?
oxmgr logs api | grep "exited with"

# 2. Any OOM kills?
sudo dmesg | grep -i oom | tail -5

# 3. What's in the error log around the crash time?
oxmgr logs api --level error --lines 50

# 4. Is memory growing before crashes?
oxmgr status --memory

# 5. Any unhandled rejection warnings before crash?
oxmgr logs api | grep -i "unhandled\|rejection\|uncaught"

# 6. Does it crash immediately on start?
node dist/server.js  # run manually, watch stderr
```

Five minutes with this checklist narrows down 90% of production crashes.

See the [memory leak guide](/blog/nodejs-memory-leaks-production) if exit code is 137, and the [deployment guide](/blog/how-to-deploy-nodejs-production) for a production-hardened setup from scratch.
