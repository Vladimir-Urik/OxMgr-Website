# oxmgr-website

Marketing site for [Oxmgr](https://github.com/Vladimir-Urik/OxMgr), built with SvelteKit + Tailwind CSS and deployed on Cloudflare.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Build

```bash
npm run build
```

Output goes to `.svelte-kit/cloudflare/`.

## Deploy to Cloudflare Workers

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated:

```bash
npm install -g wrangler
wrangler login
npm run deploy
```

The Wrangler config is in `wrangler.jsonc` and deploys the generated worker entrypoint from `.svelte-kit/cloudflare/_worker.js` together with the static asset bundle. Routing is handled by the SvelteKit worker, so no global SPA `_redirects` fallback is needed.

## Deploy to Cloudflare Pages

If you prefer Pages, this still works too:

```bash
npm run deploy:pages
```

Or connect the repo to Cloudflare Pages via the dashboard:
- Build command: `npm run build`
- Build output directory: `.svelte-kit/cloudflare`
- Node.js version: 22

## Type checking

```bash
npm run check
```

## Analytics

This site uses [self-hosted Umami](https://umami.is/) for simple aggregate traffic stats so we can understand visit trends.

## Project structure

```
src/
  routes/
    +layout.svelte          # Nav + footer shared across all pages
    +page.svelte            # Landing page (/)
    benchmark/
      +page.server.ts       # Fetches BENCHMARK.md from GitHub at build time
      +page.svelte          # Benchmark results page (/benchmark)
    docs/
      +page.svelte          # Quick start docs (/docs)
  lib/
    components/
      Terminal.svelte       # Animated typewriter terminal
      InstallTabs.svelte    # Tabbed install commands with copy button
      BenchmarkCard.svelte  # Big-number stat card
      CodeBlock.svelte      # Syntax-highlighted code block with copy
      Nav.svelte            # Top navigation bar
  app.html                  # HTML shell
  app.css                   # Global styles + Tailwind directives
```

## Stack

- [SvelteKit 2](https://kit.svelte.dev/)
- [Tailwind CSS 3](https://tailwindcss.com/)
- [highlight.js](https://highlightjs.org/) for syntax highlighting
- [@sveltejs/adapter-cloudflare](https://kit.svelte.dev/docs/adapter-cloudflare)
