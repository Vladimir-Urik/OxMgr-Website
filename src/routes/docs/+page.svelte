<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const quickStartOxfile = `version = 1

[defaults]
restart_policy = "on_failure"
max_restarts = 10
stop_timeout_secs = 5

[[apps]]
name = "api"
command = "node server.js"
cwd = "./services/api"
health_cmd = "curl -fsS http://127.0.0.1:3000/health"

[apps.env]
NODE_ENV = "production"
PORT = "3000"

[[apps]]
name = "worker"
command = "python worker.py"
cwd = "./services/worker"

[apps.env]
PYTHONUNBUFFERED = "1"`;
</script>

<svelte:head>
	<title>Quick Start — Oxmgr Docs</title>
	<meta name="description" content="Get started with Oxmgr in under two minutes. Install, write your oxfile.toml, apply your config, and monitor your processes." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs" />
	<meta property="og:title" content="Oxmgr Quick Start" />
	<meta property="og:description" content="Get from zero to running processes in under two minutes with Oxmgr." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs" />
	<meta name="twitter:title" content="Oxmgr Quick Start" />
	<meta name="twitter:description" content="Install Oxmgr and launch your first process in under two minutes." />
</svelte:head>

<!-- Page header -->
<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Quick Start</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Get from zero to running processes in under two minutes.
	</p>
</div>

<div class="space-y-8">
	<div>
		<p class="doc-step-label">1 — Install</p>
		<CodeBlock code="npm install -g oxmgr" language="bash" />
		<p class="text-xs text-zinc-600 font-mono mt-2">
			More install methods: <a href="/docs/installation" class="text-zinc-500 hover:text-white underline underline-offset-2">Homebrew, APT, Chocolatey, Scoop, AUR, source</a>
		</p>
	</div>

	<div>
		<p class="doc-step-label">2 — Write your oxfile.toml</p>
		<CodeBlock code={quickStartOxfile} language="toml" filename="oxfile.toml" />
		<p class="text-xs text-zinc-600 font-mono mt-2">
			Full reference: <a href="/docs/configuration" class="text-zinc-500 hover:text-white underline underline-offset-2">oxfile.toml configuration</a>
		</p>
	</div>

	<div>
		<p class="doc-step-label">3 — Apply</p>
		<CodeBlock code="oxmgr apply ./oxfile.toml" language="bash" />
		<p class="doc-text mt-3">
			<code class="code-inline">apply</code> is idempotent — safe to run in CI/CD. Starts new processes, restarts changed ones, leaves untouched ones alone.
		</p>
	</div>

	<div>
		<p class="doc-step-label">4 — Monitor</p>
		<CodeBlock code={`oxmgr list           # show all processes\noxmgr logs api -f    # stream logs\noxmgr ui             # interactive terminal UI`} language="bash" />
		<p class="text-xs text-zinc-600 font-mono mt-2">
			Full CLI reference: <a href="/docs/cli-reference" class="text-zinc-500 hover:text-white underline underline-offset-2">CLI Reference</a>
		</p>
	</div>
</div>

<!-- Section nav -->
<div class="mt-16 pt-8 border-t border-zinc-800 grid sm:grid-cols-2 gap-4">
	{#each [
		{ href: '/docs/installation', title: 'Installation', desc: 'All install methods: npm, Homebrew, APT, Chocolatey, AUR, source' },
		{ href: '/docs/cli-reference', title: 'CLI Reference', desc: 'All commands, flags, and keyboard shortcuts' },
		{ href: '/docs/configuration', title: 'oxfile.toml', desc: 'Full field reference, profiles, clustering, file watch' },
		{ href: '/docs/health-checks', title: 'Health Checks', desc: 'Command-based health checks and readiness gating' },
		{ href: '/docs/resource-limits', title: 'Resource Limits', desc: 'Memory, CPU limits, and cgroup enforcement' },
		{ href: '/docs/system-services', title: 'System Services', desc: 'Install Oxmgr as a system service on any platform' },
		{ href: '/docs/git-webhooks', title: 'Git & Webhooks', desc: 'Auto-deploy on push with git integration and webhooks' },
		{ href: '/docs/pm2-migration', title: 'PM2 Migration', desc: 'Import and convert your existing PM2 ecosystem config' },
		{ href: '/docs/environment-variables', title: 'Environment Variables', desc: 'OXMGR_* variables for daemon configuration' }
	] as item}
		<a href={item.href} class="group border border-zinc-800 rounded bg-zinc-900/30 px-4 py-4 hover:border-zinc-700 hover:bg-zinc-800/20 transition-colors">
			<p class="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors mb-1">{item.title} →</p>
			<p class="text-xs text-zinc-500">{item.desc}</p>
		</a>
	{/each}
</div>

<!-- Footer CTA -->
<div class="mt-12 border border-zinc-800 rounded bg-zinc-900/30 p-6">
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
