<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const healthExample = `[[apps]]
name = "api"
command = "node server.js"
health_cmd = "curl -fsS http://127.0.0.1:3000/health"
health_interval_secs = 15
health_timeout_secs = 3
health_max_failures = 3`;

	const tcpExample = `[[apps]]
name = "redis"
command = "redis-server"
health_cmd = "redis-cli ping"
health_interval_secs = 10
health_timeout_secs = 2`;

	const waitReadyExample = `[[apps]]
name = "api"
command = "node server.js"
health_cmd = "curl -fsS http://127.0.0.1:3000/health"
wait_ready = true
ready_timeout_secs = 30`;
</script>

<svelte:head>
	<title>Health Checks — Oxmgr Docs</title>
	<meta name="description" content="Configure command-based health checks in Oxmgr. Auto-restart unhealthy processes and gate zero-downtime reloads on readiness." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/health-checks" />
	<meta property="og:title" content="Oxmgr Health Checks" />
	<meta property="og:description" content="Command-based health checks: auto-restart on failure, polling intervals, timeouts, and readiness-gated zero-downtime reloads." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/health-checks" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Health Checks</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Oxmgr health checks are command-based — the daemon runs a command on a polling interval and checks the exit code.
		Exit 0 = healthy. Any other exit code = failure.
	</p>
</div>

<div class="space-y-10">

	<div>
		<h2 class="doc-heading">Basic Configuration</h2>
		<p class="doc-text mb-4">
			After <code class="code-inline">health_max_failures</code> consecutive failures, the process is automatically restarted.
		</p>
		<CodeBlock code={healthExample} language="toml" filename="oxfile.toml" />

		<div class="mt-6 grid sm:grid-cols-2 gap-3">
			{#each [
				{ label: 'Polling interval', value: 'health_interval_secs (default: 30s)' },
				{ label: 'Check timeout', value: 'health_timeout_secs (default: 5s)' },
				{ label: 'Restart trigger', value: 'After health_max_failures (default: 3)' },
				{ label: 'Healthy signal', value: 'Exit code 0 = healthy, non-zero = failure' }
			] as item}
				<div class="border border-zinc-800 rounded bg-zinc-900/30 px-4 py-3">
					<p class="text-xs font-mono text-zinc-500 mb-1">{item.label}</p>
					<p class="text-sm text-zinc-300 font-mono">{item.value}</p>
				</div>
			{/each}
		</div>
	</div>

	<div>
		<h2 class="doc-heading">Any Command Works</h2>
		<p class="doc-text mb-4">
			The health command can be anything that returns an exit code — HTTP checks with <code class="code-inline">curl</code>,
			database pings, custom scripts, or CLI health checks.
		</p>
		<CodeBlock code={tcpExample} language="toml" filename="oxfile.toml" />
		<p class="doc-text mt-3">
			Common patterns:
		</p>
		<ul class="mt-2 space-y-1.5 text-zinc-400 text-sm">
			<li><code class="code-inline">curl -fsS http://127.0.0.1:3000/health</code> — HTTP endpoint (fails on non-2xx)</li>
			<li><code class="code-inline">redis-cli ping</code> — Redis connectivity</li>
			<li><code class="code-inline">pg_isready -h localhost</code> — PostgreSQL readiness</li>
			<li><code class="code-inline">./scripts/health-check.sh</code> — custom logic</li>
		</ul>
	</div>

	<div>
		<h2 class="doc-heading">Readiness Gating During Reload</h2>
		<p class="doc-text mb-4">
			With <code class="code-inline">wait_ready = true</code>, zero-downtime reloads wait for the new process instance to pass
			the health check before the old one is stopped. If readiness times out, the reload is aborted — the old process keeps running
			and serves traffic uninterrupted.
		</p>
		<CodeBlock code={waitReadyExample} language="toml" filename="oxfile.toml" />

		<div class="mt-6 border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
			<h3 class="text-sm font-semibold text-zinc-300 mb-3">Reload sequence with wait_ready</h3>
			<ol class="text-zinc-400 text-sm space-y-2 list-none">
				{#each [
					'Run pre_reload_cmd (if set). Abort on failure.',
					'Start new process instance.',
					'Poll health_cmd until exit 0 (or ready_timeout_secs exceeded).',
					'If ready: stop old process, new one takes over.',
					'If timeout: abort reload, old process keeps running.'
				] as step, i}
					<li class="flex gap-3">
						<span class="text-rust font-mono text-xs mt-0.5">{i + 1}.</span>
						<span>{step}</span>
					</li>
				{/each}
			</ol>
		</div>
	</div>

	<div>
		<h2 class="doc-heading">Field Reference</h2>
		<div class="card overflow-hidden">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-zinc-800 bg-zinc-900/50">
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Field</th>
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Default</th>
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Description</th>
					</tr>
				</thead>
				<tbody>
					{#each [
						{ key: 'health_cmd', def: '—', desc: 'Command to run. Exit 0 = healthy, non-zero = failure.' },
						{ key: 'health_interval_secs', def: '30', desc: 'Seconds between checks.' },
						{ key: 'health_timeout_secs', def: '5', desc: 'Max seconds for a single check to complete.' },
						{ key: 'health_max_failures', def: '3', desc: 'Consecutive failures before auto-restart.' },
						{ key: 'wait_ready', def: 'false', desc: 'Gate reloads on health check readiness. Requires health_cmd.' },
						{ key: 'ready_timeout_secs', def: '30', desc: 'Timeout for readiness during reload. Abort if exceeded.' }
					] as row}
						<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
							<td class="px-4 py-3 font-mono text-rust text-xs whitespace-nowrap">{row.key}</td>
							<td class="px-4 py-3 font-mono text-zinc-500 text-xs">{row.def}</td>
							<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
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
