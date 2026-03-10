---
title: Node.js Environment Variables in Production — The Right Way to Manage Secrets
description: How to properly handle environment variables and secrets in Node.js production deployments. Covers .env files, validation, secret managers, Docker, and common mistakes that leak credentials.
date: 2026-04-06
tags: [node.js, security, environment-variables, secrets, production, devops]
keywords: [node.js environment variables production, node.js env variables, node.js dotenv production, node.js secrets management, node.js .env file, process.env node.js, node.js config production, node.js secrets best practices, nodejs environment config]
author: Oxmgr Team
---

# Node.js Environment Variables in Production

Environment variables are how you configure Node.js apps differently across environments — development, staging, production — without changing code. They're also how you keep secrets out of your source code.

Most teams get the basics right. The subtle mistakes are where credentials leak.

## The Basics

Node.js exposes environment variables through `process.env`:

```javascript
const port = process.env.PORT ?? 3000;
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
```

Set them in the shell:

```bash
DATABASE_URL=postgres://localhost/mydb node server.js
# or
export DATABASE_URL=postgres://localhost/mydb
node server.js
```

For local development, a `.env` file with a library like `dotenv` loads variables automatically:

```bash
npm install dotenv
```

```javascript
// Load at the very top of your entry file, before anything else
import 'dotenv/config';

// Now process.env.DATABASE_URL etc. are available
```

```bash
# .env (never commit this)
DATABASE_URL=postgres://localhost/myapp_dev
JWT_SECRET=dev-secret-not-used-in-production
REDIS_URL=redis://localhost:6379
```

## The Most Important Rule

**Never commit secrets to git.** Not even once. Not even in a private repo. Secret scanning tools (GitHub, GitGuardian, truffleHog) find committed secrets constantly, even after they're deleted from history.

```bash
# .gitignore — add this
.env
.env.local
.env.*.local
.env.production
.env.staging
```

Instead, commit a `.env.example` with dummy values as documentation:

```bash
# .env.example — this one IS committed
DATABASE_URL=postgres://localhost/myapp
JWT_SECRET=change-me
REDIS_URL=redis://localhost:6379
PORT=3000
```

If you've already committed secrets, rotate them immediately and then clean history:

```bash
# Remove file from entire git history (rewrites history)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Or use the newer BFG Repo Cleaner
bfg --delete-files .env
```

## Validate at Startup

Don't let the app start with missing required variables. Fail fast with a clear error:

```javascript
// config.js — validate everything before the app starts
const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'REDIS_URL',
];

const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values');
  process.exit(1);
}

// Typed config object — no more raw process.env in app code
export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS ?? '20', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
};
```

Use `zod` for stricter validation with type coercion:

```bash
npm install zod
```

```javascript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  REDIS_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment configuration:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
```

This gives you type-safe access and clear errors when variables are wrong.

## Setting Variables in Production

### Option 1: `.env` file on the server

Simple and widely used. Create the file directly on the server:

```bash
# SSH into server
nano /var/www/myapp/.env.production
```

```env
NODE_ENV=production
DATABASE_URL=postgres://user:password@rds.amazonaws.com:5432/myapp
JWT_SECRET=a-very-long-random-string-generated-with-openssl
REDIS_URL=redis://cache.internal:6379
```

Secure the file:

```bash
chmod 600 /var/www/myapp/.env.production
chown nodeapp:nodeapp /var/www/myapp/.env.production
```

Reference it in your process manager (see [How to Deploy Node.js to Production](/blog/how-to-deploy-nodejs-production) for the full env var setup in context):

```toml
# oxfile.toml
[processes.api]
command = "node dist/server.js"
env_file = ".env.production"

# Also set non-secret config directly in the toml
env = { NODE_ENV = "production", PORT = "3000" }
```

**Pros:** Simple, no dependencies.
**Cons:** Files on disk can be read by anyone with access to the server. Use file permissions carefully.

### Option 2: Variables set directly in process manager

For non-secret config, set directly in `oxfile.toml`:

```toml
[processes.api]
env = {
  NODE_ENV = "production",
  PORT = "3000",
  LOG_LEVEL = "info",
  DB_MAX_CONNECTIONS = "20"
}
```

Secrets still go in `env_file`.

### Option 3: Systemd EnvironmentFile

If you're using systemd directly:

```ini
[Service]
EnvironmentFile=/etc/myapp/production.env
Environment=NODE_ENV=production
```

```bash
# /etc/myapp/production.env
DATABASE_URL=postgres://...
JWT_SECRET=...
```

```bash
# Restrict access
sudo chmod 600 /etc/myapp/production.env
sudo chown root:nodeapp /etc/myapp/production.env
```

### Option 4: Secret Managers (for teams)

For larger teams where rotating secrets without SSH access matters:

**AWS Secrets Manager / Parameter Store:**

```bash
npm install @aws-sdk/client-secrets-manager
```

```javascript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'eu-west-1' });

async function getSecret(secretName) {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString);
}

// At startup — before server.listen()
const secrets = await getSecret('myapp/production');
process.env.DATABASE_URL = secrets.databaseUrl;
process.env.JWT_SECRET = secrets.jwtSecret;
```

**HashiCorp Vault:**

```bash
npm install node-vault
```

```javascript
import vault from 'node-vault';

const client = vault({ endpoint: 'https://vault.internal', token: process.env.VAULT_TOKEN });
const secrets = await client.read('secret/myapp/production');

process.env.DATABASE_URL = secrets.data.database_url;
process.env.JWT_SECRET = secrets.data.jwt_secret;
```

**When to use secret managers:** When you have multiple servers and need to rotate secrets without SSH-ing into each one. For a single VPS, the complexity usually isn't worth it.

## Environment-Specific Config Files

Use separate env files per environment:

```
.env.example       ← committed (dummy values, documentation)
.env               ← local development (gitignored)
.env.staging       ← staging server (gitignored)
.env.production    ← production server (gitignored)
```

Load the right file based on `NODE_ENV`:

```javascript
import { config } from 'dotenv';

config({
  path: `.env.${process.env.NODE_ENV ?? 'development'}`,
  override: false  // don't override already-set variables
});
```

## Common Mistakes

**Logging environment variables:**

```javascript
// NEVER do this — secrets appear in your logs
console.log('Config:', process.env);
console.log('DB URL:', process.env.DATABASE_URL);

// Safe alternative — log non-sensitive keys only
const safeKeys = ['NODE_ENV', 'PORT', 'LOG_LEVEL'];
console.log('Config:', Object.fromEntries(
  safeKeys.map(k => [k, process.env[k]])
));
```

**Sending environment variables to clients:**

```javascript
// DANGEROUS — exposes all server-side env vars to the browser
app.get('/config', (req, res) => {
  res.json(process.env);  // includes DATABASE_URL, JWT_SECRET, etc.
});

// Safe — only explicitly allowlisted public config
app.get('/config', (req, res) => {
  res.json({
    apiUrl: process.env.PUBLIC_API_URL,
    version: process.env.npm_package_version,
  });
});
```

**Using `.env` in production directly (with dotenv):**

dotenv's `.env` file loading is fine for local dev. In production, prefer setting variables through the process manager (`env_file` in `oxfile.toml`) rather than loading `.env` in your application code. This way, secrets never touch your application's file system in a predictable location.

**Weak secrets:**

```bash
# Bad
JWT_SECRET=secret
JWT_SECRET=mysecret123
JWT_SECRET=password

# Good — generate with:
openssl rand -base64 48
# → "K8mN3xQvY2pL9cR7tH5wB1dF6nZ4oA0eI3sU8jW" (64 characters, truly random)
```

## Rotating Secrets Without Downtime

When you need to rotate a secret (scheduled rotation, potential compromise), do it without downtime:

1. Generate new secret
2. Add new secret alongside old in your secret store
3. Deploy app that accepts both old and new (e.g., JWT verification checks both secrets)
4. Verify new secret works
5. Remove old secret from app
6. Remove old secret from store

For most apps, a rolling restart with new env vars is enough:

```bash
# Update .env.production with new secret
# Then rolling restart — instances restart one at a time, no downtime
oxmgr reload api
```

## Summary

- **Never commit secrets** — `.env` in `.gitignore`, always
- **Validate at startup** — fail fast with clear errors using zod or manual checks
- **Use env_file in process manager** — don't rely on dotenv in production app code
- **Restrict file permissions** — `chmod 600` on `.env.*` files
- **Never log secrets** — audit your log statements
- **Use a secret manager** if you have multiple servers or compliance requirements

See the [deployment guide](/blog/how-to-deploy-nodejs-production) for how environment variables fit into the full production setup, or the [production checklist](/blog/nodejs-production-best-practices) for other security items.
