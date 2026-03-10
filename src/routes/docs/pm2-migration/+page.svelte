<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const pm2MigrateExample = `# Step 1 — Import existing PM2 ecosystem file
oxmgr import ./ecosystem.config.json

# Step 2 — Convert to native oxfile format
oxmgr convert ecosystem.config.json --out oxfile.toml

# Step 3 — Validate
oxmgr validate ./oxfile.toml --env prod

# Step 4 — Apply
oxmgr apply ./oxfile.toml --env prod`;

	const pm2EcosystemExample = `// ecosystem.config.js (PM2)
module.exports = {
  apps: [{
    name: 'api',
    script: 'dist/server.js',
    instances: 4,
    exec_mode: 'cluster',
    env: { NODE_ENV: 'development' },
    env_production: { NODE_ENV: 'production', PORT: 80 }
  }]
};`;

	const oxfileEquivalent = `# oxfile.toml (Oxmgr equivalent)
version = 1

[[apps]]
name = "api"
command = "node dist/server.js"
cluster_mode = true
cluster_instances = 4

[apps.env]
NODE_ENV = "development"

[apps.profiles.production.env]
NODE_ENV = "production"
PORT = "80"`;
</script>

<svelte:head>
	<title>PM2 Migration — Oxmgr Docs</title>
	<meta name="description" content="Migrate from PM2 to Oxmgr. Import ecosystem.config.json, convert to oxfile.toml, and understand the format differences." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/pm2-migration" />
	<meta property="og:title" content="Migrating from PM2 to Oxmgr" />
	<meta property="og:description" content="Step-by-step PM2 to Oxmgr migration: import ecosystem.config.json, convert to oxfile.toml, validate, and apply." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/pm2-migration" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">PM2 Migration</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Oxmgr supports PM2's <code class="code-inline">ecosystem.config.json</code> for a smooth migration path.
		Import existing config directly, then convert to the native format at your own pace.
	</p>
</div>

<div class="space-y-10">

	<div>
		<h2 class="doc-heading">Migration Steps</h2>
		<CodeBlock code={pm2MigrateExample} language="bash" />
		<p class="doc-text mt-3">
			The <code class="code-inline">import</code> command lets you run Oxmgr with your existing PM2 config immediately,
			with no changes required. Convert to <code class="code-inline">oxfile.toml</code> when you're ready.
		</p>
	</div>

	<div>
		<h2 class="doc-heading">Format Comparison</h2>
		<p class="doc-text mb-4">Side-by-side: the same app in PM2 and Oxmgr format.</p>
		<div class="grid md:grid-cols-2 gap-4">
			<div>
				<p class="text-xs font-mono text-zinc-500 mb-2 uppercase tracking-wider">PM2 ecosystem.config.js</p>
				<CodeBlock code={pm2EcosystemExample} language="javascript" />
			</div>
			<div>
				<p class="text-xs font-mono text-zinc-500 mb-2 uppercase tracking-wider">Oxmgr oxfile.toml</p>
				<CodeBlock code={oxfileEquivalent} language="toml" />
			</div>
		</div>
	</div>

	<div>
		<h2 class="doc-heading">Feature Comparison</h2>
		<div class="card overflow-hidden">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-zinc-800 bg-zinc-900/50">
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Topic</th>
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">PM2 ecosystem.json</th>
						<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">oxfile.toml</th>
					</tr>
				</thead>
				<tbody>
					{#each [
						{ topic: 'Profiles / environments', pm2: 'env_<name> pattern', ox: '[apps.profiles.<name>]' },
						{ topic: 'App dependencies', pm2: 'limited/indirect', ox: 'explicit depends_on' },
						{ topic: 'Crash-loop cutoff', pm2: 'compatibility only', ox: 'native crash_restart_limit' },
						{ topic: 'Apply idempotency', pm2: 'medium', ox: 'high' },
						{ topic: 'Readability at scale', pm2: 'medium', ox: 'high' },
						{ topic: 'Dynamic JS execution', pm2: 'yes (config.js)', ox: 'no (safer, version-controlled)' },
						{ topic: 'Health checks', pm2: 'basic', ox: 'command-based + readiness gating' },
						{ topic: 'Resource limits', pm2: 'memory only', ox: 'memory + CPU + cgroup v2' },
						{ topic: 'Daemon memory', pm2: '~83 MB', ox: '~4 MB' }
					] as row}
						<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
							<td class="px-4 py-3 text-zinc-300 text-sm font-medium">{row.topic}</td>
							<td class="px-4 py-3 text-zinc-500 text-sm">{row.pm2}</td>
							<td class="px-4 py-3 text-zinc-300 text-sm">{row.ox}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div class="border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
		<h3 class="text-sm font-semibold text-zinc-300 mb-2">Things to watch when migrating</h3>
		<ul class="text-zinc-500 text-sm space-y-1.5">
			<li><span class="text-rust mr-2">—</span>PM2's <code class="code-inline">exec_mode: "cluster"</code> maps to <code class="code-inline">cluster_mode = true</code>.</li>
			<li><span class="text-rust mr-2">—</span>PM2's <code class="code-inline">env_production</code> maps to <code class="code-inline">[apps.profiles.production.env]</code>.</li>
			<li><span class="text-rust mr-2">—</span>Oxmgr health checks are command-based, not HTTP endpoint objects like in PM2.</li>
			<li><span class="text-rust mr-2">—</span>Oxmgr doesn't support dynamic JavaScript in config files — use profiles instead.</li>
			<li><span class="text-rust mr-2">—</span>Run <code class="code-inline">oxmgr validate ./oxfile.toml</code> before applying to catch errors early.</li>
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
