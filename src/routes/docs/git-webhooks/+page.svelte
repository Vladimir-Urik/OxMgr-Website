<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const gitWebhookExample = `[[apps]]
name = "api"
command = "node server.js"
git_repo = "git@github.com:org/api.git"
git_ref = "main"
pull_secret = "super-secret-token"`;

	const webhookCurl = `# Trigger pull via webhook
curl -X POST http://localhost:PORT/pull/api \\
  -H "X-Oxmgr-Secret: super-secret-token"`;

	const metricsExample = `# Prometheus scrape config
scrape_configs:
  - job_name: oxmgr
    static_configs:
      - targets: ["127.0.0.1:51234"]
    metrics_path: /metrics`;

	const githubActionsExample = `# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Oxmgr pull
        run: |
          curl -fsS -X POST https://your-server.com/pull/api \\
            -H "X-Oxmgr-Secret: \${{ secrets.OXMGR_SECRET }}"`;
</script>

<svelte:head>
	<title>Git & Webhooks — Oxmgr Docs</title>
	<meta name="description" content="Auto-deploy with Oxmgr git integration. Connect processes to git repos, trigger pulls via webhook, and scrape Prometheus metrics from the built-in API." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/git-webhooks" />
	<meta property="og:title" content="Oxmgr Git & Webhooks" />
	<meta property="og:description" content="Git integration and webhook-based auto-deploy for Oxmgr. Pull on push, idempotent reload, and Prometheus metrics." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/git-webhooks" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Git &amp; Webhooks</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Enable auto-deployment by connecting a process to a git repository.
		<code class="code-inline">oxmgr pull</code> fetches the latest code and reloads/restarts
		only when the commit changed.
	</p>
</div>

<div class="space-y-10">

	<div>
		<h2 class="doc-heading">Configure in oxfile.toml</h2>
		<CodeBlock code={gitWebhookExample} language="toml" filename="oxfile.toml" />
	</div>

	<div>
		<h2 class="doc-heading">Manual Pull</h2>
		<CodeBlock code={`oxmgr pull api       # pull specific process\noxmgr pull           # pull all git-tracked processes`} language="bash" />
	</div>

	<div>
		<h2 class="doc-heading">Pull Behavior</h2>
		<p class="doc-text mb-4">Pull is idempotent — running it multiple times on the same commit has no side effects.</p>
		<div class="card overflow-hidden">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-zinc-800 bg-zinc-900/50">
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">State</th>
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each [
						{ state: 'Commit unchanged', action: 'No restart or reload — idempotent' },
						{ state: 'Commit changed + process running', action: 'reload' },
						{ state: 'Commit changed + process stopped', action: 'restart (to match desired state)' },
						{ state: 'Commit changed + desired state stopped', action: 'Checkout only, no restart' }
					] as row}
						<tr class="border-b border-zinc-800/60 last:border-0">
							<td class="px-4 py-3 text-zinc-400 text-sm">{row.state}</td>
							<td class="px-4 py-3 font-mono text-zinc-300 text-xs">{row.action}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div>
		<h2 class="doc-heading">Webhook Endpoint</h2>
		<p class="doc-text mb-4">
			The daemon exposes an HTTP API. Point your CI/CD or GitHub Actions to this endpoint
			to trigger automatic deploys on push.
		</p>
		<CodeBlock code={webhookCurl} language="bash" />

		<div class="mt-4 card overflow-hidden">
			<table class="w-full text-sm">
				<tbody>
					{#each [
						{ label: 'Pull endpoint', value: 'POST /pull/<name|id>' },
						{ label: 'Metrics endpoint', value: 'GET /metrics' },
						{ label: 'Auth header', value: 'X-Oxmgr-Secret: <pull_secret>' },
						{ label: 'Alt auth', value: 'Authorization: Bearer <pull_secret>' },
						{ label: 'Bind address', value: 'OXMGR_API_ADDR env var (default: high localhost port)' }
					] as row}
						<tr class="border-b border-zinc-800/60 last:border-0">
							<td class="px-4 py-2.5 text-zinc-500 text-xs font-mono w-36">{row.label}</td>
							<td class="px-4 py-2.5 text-zinc-300 text-xs font-mono">{row.value}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div>
		<h2 class="doc-heading">GitHub Actions Integration</h2>
		<p class="doc-text mb-4">
			Trigger a pull from GitHub Actions on push to main. Store the webhook secret as a repository secret.
		</p>
		<CodeBlock code={githubActionsExample} language="yaml" filename=".github/workflows/deploy.yml" />
	</div>

	<div>
		<h2 class="doc-heading">Prometheus Metrics</h2>
		<p class="doc-text mb-4">
			The <code class="code-inline">GET /metrics</code> endpoint returns Prometheus text exposition format.
			Exposed metrics include process state, restart count, CPU, memory, PID, health-check status, and timestamps.
		</p>
		<CodeBlock code={metricsExample} language="yaml" filename="prometheus.yml" />
	</div>

	<div class="border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
		<h3 class="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
			<svg class="w-4 h-4 text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 4v4M8 11.5v.5" stroke-linecap="round"/>
			</svg>
			Security
		</h3>
		<ul class="text-zinc-500 text-sm space-y-1.5">
			<li><span class="text-rust mr-2">—</span>Keep the API bound to localhost unless you intentionally expose it externally.</li>
			<li><span class="text-rust mr-2">—</span>Use long random secrets and rotate on incident response.</li>
			<li><span class="text-rust mr-2">—</span>Prefer SSH deploy keys with read-only repository access.</li>
			<li><span class="text-rust mr-2">—</span>If exposing remotely, protect with reverse-proxy auth or source IP filtering.</li>
		</ul>
	</div>

</div>

<!-- Footer CTA -->
<div class="mt-16 border border-zinc-800 rounded bg-zinc-900/30 p-6">
	<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
		<div class="flex-1">
			<h3 class="font-semibold text-white mb-1">Still have questions?</h3>
			<p class="text-zinc-400 text-sm">Open an issue or browse the source on GitHub.</p>
		</div>
		<a
			href="https://github.com/Vladimir-Urik/OxMgr/issues"
			target="_blank"
			rel="noopener noreferrer"
			class="btn-primary text-sm shrink-0"
		>
			Open an Issue ↗
		</a>
	</div>
</div>
