<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	let tocOpen = false;

	const sections = [
		{ id: 'quick-start', label: 'Quick Start' },
		{ id: 'installation', label: 'Installation' },
		{ id: 'cli-reference', label: 'CLI Reference' },
		{ id: 'oxfile', label: 'oxfile.toml' },
		{ id: 'health-checks', label: 'Health Checks' },
		{ id: 'resource-limits', label: 'Resource Limits' },
		{ id: 'system-services', label: 'System Services' },
		{ id: 'git-webhooks', label: 'Git & Webhooks' },
		{ id: 'pm2-migration', label: 'PM2 Migration' },
		{ id: 'env-vars', label: 'Environment Variables' }
	];

	function scrollTo(id: string) {
		tocOpen = false;
		const el = document.getElementById(id);
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// Code examples
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

	const aptSigned = `sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://vladimir-urik.github.io/OxMgr/apt/keyrings/oxmgr-archive-keyring.gpg \\
  | sudo tee /etc/apt/keyrings/oxmgr-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/oxmgr-archive-keyring.gpg] https://vladimir-urik.github.io/OxMgr/apt stable main" \\
  | sudo tee /etc/apt/sources.list.d/oxmgr.list
sudo apt update && sudo apt install oxmgr`;

	const healthExample = `[[apps]]
name = "api"
command = "node server.js"
health_cmd = "curl -fsS http://127.0.0.1:3000/health"
health_interval_secs = 15
health_timeout_secs = 3
health_max_failures = 3`;

	const resourceExample = `[[apps]]
name = "api"
command = "node server.js"
max_memory_mb = 512
max_cpu_percent = 80.0
cgroup_enforce = true  # Linux only — hard limits via cgroup v2
deny_gpu = true        # best-effort GPU disable`;

	const serviceExample = `# Install daemon as system service (auto-detects platform)
oxmgr service install --system auto

# Check service status
oxmgr service status --system auto

# Uninstall service
oxmgr service uninstall --system auto`;

	const gitWebhookExample = `[[apps]]
name = "api"
command = "node server.js"
git_repo = "git@github.com:org/api.git"
git_ref = "main"
pull_secret = "super-secret-token"`;

	const webhookCurl = `# Trigger pull via webhook
curl -X POST http://localhost:PORT/pull/api \\
  -H "X-Oxmgr-Secret: super-secret-token"`;

	const pm2MigrateExample = `# Step 1 — Import existing PM2 ecosystem file
oxmgr import ./ecosystem.config.json

# Step 2 — Convert to native oxfile format
oxmgr convert ecosystem.config.json --out oxfile.toml

# Step 3 — Validate
oxmgr validate ./oxfile.toml --env prod

# Step 4 — Apply
oxmgr apply ./oxfile.toml --env prod`;

	const instancesExample = `[[apps]]
name = "worker"
command = "node worker.js"
instances = 3
instance_var = "INSTANCE_ID"
# Expands to: worker-0, worker-1, worker-2
# Each gets env var INSTANCE_ID=0/1/2`;

	const clusterExample = `[[apps]]
name = "api"
command = "node server.js"
cluster_mode = true
cluster_instances = 4  # omit to use all CPUs`;

	const profilesExample = `version = 1

[defaults]
restart_policy = "on_failure"

[[apps]]
name = "api"
command = "node server.js"

[apps.env]
NODE_ENV = "development"
PORT = "3000"

[apps.profiles.prod]
[apps.profiles.prod.env]
NODE_ENV = "production"
PORT = "80"`;

	const deployExample = `[deploy.production]
user = "ubuntu"
host = ["192.168.0.13", "192.168.0.14"]
repo = "git@github.com:org/api.git"
ref = "origin/main"
path = "/var/www/api"
pre_deploy = "npm ci"
post_deploy = "oxmgr apply ./oxfile.toml --env production"`;
</script>

<svelte:head>
	<title>Docs — Oxmgr</title>
	<meta name="description" content="Complete Oxmgr documentation: installation, CLI reference, oxfile.toml configuration, health checks, resource limits, system services, Git webhooks, and PM2 migration." />
	<link rel="canonical" href="https://oxmgr.dev/docs" />
	<meta property="og:title" content="Oxmgr Documentation" />
	<meta property="og:description" content="Installation, CLI reference, oxfile.toml config, health checks, system services, Git webhooks, and PM2 migration guide." />
	<meta property="og:url" content="https://oxmgr.dev/docs" />
	<meta name="twitter:title" content="Oxmgr Documentation" />
	<meta name="twitter:description" content="Complete guide: install, configure, and run Oxmgr in production." />
</svelte:head>

<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-24">
	<div class="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12 xl:gap-16">

		<!-- Sidebar (desktop) -->
		<aside class="hidden lg:block">
			<div class="sticky top-24">
				<p class="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4 px-1">Contents</p>
				<nav class="space-y-0.5">
					{#each sections as s}
						<button
							on:click={() => scrollTo(s.id)}
							class="w-full text-left px-3 py-2 text-sm font-mono text-zinc-500 hover:text-white
							       hover:bg-zinc-800/50 rounded transition-colors"
						>
							{s.label}
						</button>
					{/each}
				</nav>
				<div class="mt-8 pt-6 border-t border-zinc-800 space-y-2">
					<a
						href="https://github.com/Vladimir-Urik/OxMgr"
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-2 text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors px-1"
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
							<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
						</svg>
						GitHub
					</a>
					<a
						href="/benchmark"
						class="flex items-center gap-2 text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors px-1"
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M2 12l3-4 3 2 3-5 3 3" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Benchmarks
					</a>
				</div>
			</div>
		</aside>

		<!-- Main content -->
		<main class="min-w-0">

			<!-- Page header -->
			<div class="mb-10 sm:mb-12">
				<p class="section-label">Documentation</p>
				<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Oxmgr Docs</h1>
				<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
					Everything you need to install, configure, and run Oxmgr in production.
				</p>
			</div>

			<!-- Mobile TOC toggle -->
			<div class="lg:hidden mb-8">
				<button
					on:click={() => (tocOpen = !tocOpen)}
					class="flex items-center gap-2 text-sm font-mono text-zinc-400 border border-zinc-800
					       bg-zinc-900/60 rounded px-4 py-2.5 w-full hover:border-zinc-700 transition-colors"
				>
					<svg class="w-4 h-4 text-zinc-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M2 4h12M2 8h8M2 12h10" stroke-linecap="round"/>
					</svg>
					<span>Table of Contents</span>
					<svg class="w-4 h-4 ml-auto text-zinc-600 transition-transform {tocOpen ? 'rotate-180' : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				{#if tocOpen}
					<div class="mt-1 border border-zinc-800 rounded bg-zinc-900/80 overflow-hidden">
						{#each sections as s}
							<button
								on:click={() => scrollTo(s.id)}
								class="w-full text-left px-4 py-2.5 text-sm font-mono text-zinc-400 hover:text-white
								       hover:bg-zinc-800/50 border-b border-zinc-800/60 last:border-0 transition-colors"
							>
								{s.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- ─── SECTIONS ─────────────────────────────────────── -->
			<div class="space-y-16 sm:space-y-20">

				<!-- Quick Start -->
				<section id="quick-start" class="scroll-mt-24">
					<h2 class="doc-heading">Quick Start</h2>
					<p class="doc-text mb-6">Get from zero to running processes in under two minutes.</p>

					<div class="space-y-8">
						<div>
							<p class="doc-step-label">1 — Install</p>
							<CodeBlock code="npm install -g oxmgr" language="bash" />
							<p class="text-xs text-zinc-600 font-mono mt-2">
								More install methods: <a href="#installation" on:click|preventDefault={() => scrollTo('installation')} class="text-zinc-500 hover:text-white underline underline-offset-2">Homebrew, APT, Chocolatey, source</a>
							</p>
						</div>

						<div>
							<p class="doc-step-label">2 — Write your oxfile.toml</p>
							<CodeBlock code={quickStartOxfile} language="toml" filename="oxfile.toml" />
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
						</div>
					</div>
				</section>

				<!-- Installation -->
				<section id="installation" class="scroll-mt-24">
					<h2 class="doc-heading">Installation</h2>
					<p class="doc-text mb-6">Oxmgr supports Linux, macOS, and Windows.</p>

					<div class="space-y-6">
						<div>
							<h3 class="doc-subheading">npm / yarn</h3>
							<CodeBlock code={`npm install -g oxmgr\n# or\nyarn global add oxmgr`} language="bash" />
						</div>

						<div>
							<h3 class="doc-subheading">Homebrew <span class="text-zinc-600 font-normal text-sm">macOS</span></h3>
							<CodeBlock code={`brew tap empellio/homebrew-tap\nbrew install oxmgr`} language="bash" />
						</div>

						<div>
							<h3 class="doc-subheading">Chocolatey <span class="text-zinc-600 font-normal text-sm">Windows</span></h3>
							<CodeBlock code="choco install oxmgr -y" language="bash" />
						</div>

						<div>
							<h3 class="doc-subheading">APT — signed <span class="text-zinc-600 font-normal text-sm">Debian / Ubuntu (recommended)</span></h3>
							<CodeBlock code={aptSigned} language="bash" />
						</div>

						<div>
							<h3 class="doc-subheading">Build from source <span class="text-zinc-600 font-normal text-sm">Requires Rust toolchain</span></h3>
							<CodeBlock code={`git clone https://github.com/Vladimir-Urik/OxMgr.git\ncd OxMgr\ncargo build --release\n./target/release/oxmgr --help`} language="bash" />
						</div>

						<div>
							<h3 class="doc-subheading">Verify install</h3>
							<CodeBlock code={`oxmgr --help\noxmgr list`} language="bash" />
						</div>
					</div>
				</section>

				<!-- CLI Reference -->
				<section id="cli-reference" class="scroll-mt-24">
					<h2 class="doc-heading">CLI Reference</h2>
					<p class="doc-text mb-6">All commands grouped by category.</p>

					<div class="space-y-8">
						<div>
							<h3 class="doc-subheading">Runtime &amp; monitoring</h3>
							<div class="card overflow-hidden">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-zinc-800 bg-zinc-900/50">
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Command</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs hidden sm:table-cell">Aliases</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Description</th>
										</tr>
									</thead>
									<tbody>
										{#each [
											{ cmd: 'oxmgr list', alias: 'ls, ps', desc: 'Show all processes with status, CPU, RAM, uptime' },
											{ cmd: 'oxmgr status <name>', alias: '', desc: 'Detailed process info including restart policy, limits, log paths' },
											{ cmd: 'oxmgr logs <name> [-f]', alias: 'log', desc: 'Stream or show logs. --lines <n> for history' },
											{ cmd: 'oxmgr ui', alias: '', desc: 'Interactive terminal UI with keyboard + mouse' }
										] as row}
											<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
												<td class="px-4 py-3 font-mono text-zinc-200 text-xs whitespace-nowrap">{row.cmd}</td>
												<td class="px-4 py-3 font-mono text-zinc-600 text-xs hidden sm:table-cell">{row.alias}</td>
												<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>

						<div>
							<h3 class="doc-subheading">Lifecycle</h3>
							<div class="card overflow-hidden">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-zinc-800 bg-zinc-900/50">
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Command</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs hidden sm:table-cell">Aliases</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Description</th>
										</tr>
									</thead>
									<tbody>
										{#each [
											{ cmd: 'oxmgr start "<cmd>" --name <n>', alias: '', desc: 'Start a process. See start options below.' },
											{ cmd: 'oxmgr stop <name>', alias: '', desc: 'Stop a running process' },
											{ cmd: 'oxmgr restart <name>', alias: 'rs', desc: 'Restart a process (resets crash-loop counter)' },
											{ cmd: 'oxmgr reload <name>', alias: '', desc: 'Graceful reload (zero-downtime where supported)' },
											{ cmd: 'oxmgr pull [name]', alias: '', desc: 'Git pull + reload/restart only if commit changed' },
											{ cmd: 'oxmgr delete <name>', alias: 'rm', desc: 'Stop and remove process from daemon state' }
										] as row}
											<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
												<td class="px-4 py-3 font-mono text-zinc-200 text-xs whitespace-nowrap">{row.cmd}</td>
												<td class="px-4 py-3 font-mono text-zinc-600 text-xs hidden sm:table-cell">{row.alias}</td>
												<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>

						<div>
							<h3 class="doc-subheading">Start options</h3>
							<div class="card overflow-hidden">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-zinc-800 bg-zinc-900/50">
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Flag</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Default</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Description</th>
										</tr>
									</thead>
									<tbody>
										{#each [
											{ flag: '--name <n>', def: '', desc: 'Process name used in CLI commands' },
											{ flag: '--restart <policy>', def: 'on-failure', desc: 'always | on-failure | never' },
											{ flag: '--max-restarts <n>', def: '10', desc: 'Max consecutive auto-restarts' },
											{ flag: '--crash-restart-limit <n>', def: '3', desc: 'Stop restarting after N crashes in 5 min. 0 = disabled' },
											{ flag: '--cwd <path>', def: '', desc: 'Working directory for the process' },
											{ flag: '--env KEY=VALUE', def: '', desc: 'Environment variable (repeatable)' },
											{ flag: '--watch', def: 'false', desc: 'Watch cwd and restart on file changes' },
											{ flag: '--health-cmd <cmd>', def: '', desc: 'Command polled to verify health' },
											{ flag: '--health-interval <s>', def: '30', desc: 'Seconds between health checks' },
											{ flag: '--health-timeout <s>', def: '5', desc: 'Timeout for each health check' },
											{ flag: '--health-max-failures <n>', def: '3', desc: 'Failures before restart' },
											{ flag: '--cluster', def: 'false', desc: 'Node.js cluster mode' },
											{ flag: '--cluster-instances <n>', def: 'all CPUs', desc: 'Worker count (requires --cluster)' },
											{ flag: '--max-memory-mb <n>', def: '', desc: 'Memory limit in MB' },
											{ flag: '--max-cpu-percent <n>', def: '', desc: 'CPU usage limit (%)' },
											{ flag: '--restart-delay <s>', def: '0', desc: 'Delay between auto-restarts' },
											{ flag: '--stop-timeout <s>', def: '5', desc: 'Grace period before force-kill' }
										] as row}
											<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
												<td class="px-4 py-3 font-mono text-rust text-xs whitespace-nowrap">{row.flag}</td>
												<td class="px-4 py-3 font-mono text-zinc-600 text-xs">{row.def}</td>
												<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>

						<div>
							<h3 class="doc-subheading">Config commands</h3>
							<div class="card overflow-hidden">
								<table class="w-full text-sm">
									<tbody>
										{#each [
											{ cmd: 'oxmgr apply <path> [--env <profile>] [--only a,b] [--prune]', desc: 'Apply oxfile config. --prune removes unmanaged processes.' },
											{ cmd: 'oxmgr validate <path> [--env <profile>]', desc: 'Validate oxfile before deploy. Great for CI.' },
											{ cmd: 'oxmgr import <source> [--sha256 <hex>]', desc: 'Import oxpkg bundle or ecosystem.config.json' },
											{ cmd: 'oxmgr export <name>', desc: 'Export process config as oxpkg bundle' },
											{ cmd: 'oxmgr convert <ecosystem.json> --out <oxfile.toml>', desc: 'Convert PM2 ecosystem JSON to oxfile.toml' }
										] as row}
											<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
												<td class="px-4 py-3 font-mono text-zinc-200 text-xs align-top whitespace-nowrap pr-6">{row.cmd}</td>
												<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>

						<div>
							<h3 class="doc-subheading">Interactive UI — keyboard shortcuts</h3>
							<div class="card overflow-hidden">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-zinc-800 bg-zinc-900/50">
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Key</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Action</th>
										</tr>
									</thead>
									<tbody>
										{#each [
											{ key: 'j / k or ↑↓', action: 'Move selection up / down' },
											{ key: 'n', action: 'Create new process' },
											{ key: 's', action: 'Stop selected' },
											{ key: 'r', action: 'Restart selected' },
											{ key: 'l', action: 'Reload selected' },
											{ key: 'p', action: 'Pull selected (git pull + reload)' },
											{ key: 't', action: 'Preview latest log line' },
											{ key: 'g / Space', action: 'Refresh now' },
											{ key: '?', action: 'Show help overlay' },
											{ key: 'Esc', action: 'Open / close menu' },
											{ key: 'q', action: 'Quit' }
										] as row}
											<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
												<td class="px-4 py-3">
													<kbd class="font-mono text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-0.5">{row.key}</kbd>
												</td>
												<td class="px-4 py-3 text-zinc-400 text-sm">{row.action}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							<p class="text-xs text-zinc-600 font-mono mt-2">Mouse: click row to select, scroll wheel to navigate</p>
						</div>
					</div>
				</section>

				<!-- oxfile.toml -->
				<section id="oxfile" class="scroll-mt-24">
					<h2 class="doc-heading">oxfile.toml</h2>
					<p class="doc-text mb-6">
						Native Oxmgr configuration format. Designed for deterministic, idempotent process management via <code class="code-inline">oxmgr apply</code>.
					</p>

					<div class="space-y-8">
						<div>
							<h3 class="doc-subheading">File structure</h3>
							<CodeBlock code={`version = 1\n\n[defaults]\n# optional defaults for all apps\n\n[[apps]]\n# repeated app entries`} language="toml" />
						</div>

						<div>
							<h3 class="doc-subheading">Full field reference</h3>
							<div class="card overflow-hidden">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-zinc-800 bg-zinc-900/50">
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Field</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Type</th>
											<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Description</th>
										</tr>
									</thead>
									<tbody>
										{#each [
											{ key: 'name', type: 'string', desc: 'Process identifier. Used in all CLI commands.' },
											{ key: 'command', type: 'string*', desc: 'Shell command to run. Required per app.' },
											{ key: 'cwd', type: 'string?', desc: 'Working directory for the process.' },
											{ key: 'env', type: 'table?', desc: 'Environment variables as key-value pairs.' },
											{ key: 'restart_policy', type: 'string?', desc: '"always" | "on_failure" | "never". Default: on_failure.' },
											{ key: 'max_restarts', type: 'int?', desc: 'Max consecutive restarts before entering errored state.' },
											{ key: 'crash_restart_limit', type: 'int?', desc: 'Stop after N auto-restarts in 5 min. Default 3. Set 0 to disable.' },
											{ key: 'stop_timeout_secs', type: 'int?', desc: 'Seconds to wait for graceful shutdown before force-kill.' },
											{ key: 'stop_signal', type: 'string?', desc: 'Signal sent on stop (e.g. SIGTERM, SIGINT).' },
											{ key: 'restart_delay_secs', type: 'int?', desc: 'Delay between automatic restarts.' },
											{ key: 'start_delay_secs', type: 'int?', desc: 'Delay before initial process start.' },
											{ key: 'health_cmd', type: 'string?', desc: 'Command polled to verify process health.' },
											{ key: 'health_interval_secs', type: 'int?', desc: 'Seconds between health checks. Default 30.' },
											{ key: 'health_timeout_secs', type: 'int?', desc: 'Timeout per health check. Default 5.' },
											{ key: 'health_max_failures', type: 'int?', desc: 'Failures before process restart. Default 3.' },
											{ key: 'max_memory_mb', type: 'int?', desc: 'Memory limit in MB. Triggers restart if exceeded.' },
											{ key: 'max_cpu_percent', type: 'float?', desc: 'CPU limit (%). Triggers restart if exceeded.' },
											{ key: 'cgroup_enforce', type: 'bool?', desc: 'Linux only. Applies hard limits via cgroup v2.' },
											{ key: 'deny_gpu', type: 'bool?', desc: 'Best-effort GPU disable via environment variables.' },
											{ key: 'cluster_mode', type: 'bool?', desc: 'Node.js cluster fan-out mode.' },
											{ key: 'cluster_instances', type: 'int?', desc: 'Worker count. Defaults to all CPUs.' },
											{ key: 'instances', type: 'int?', desc: 'Expand one entry into N named processes.' },
											{ key: 'instance_var', type: 'string?', desc: 'Env var set to instance index (0, 1, 2…).' },
											{ key: 'depends_on', type: 'string[]?', desc: 'Start after listed apps are running.' },
											{ key: 'start_order', type: 'int?', desc: 'Tie-break start ordering.' },
											{ key: 'namespace', type: 'string?', desc: 'Group processes under a namespace.' },
											{ key: 'git_repo', type: 'string?', desc: 'Git remote URL for oxmgr pull.' },
											{ key: 'git_ref', type: 'string?', desc: 'Branch or tag to track.' },
											{ key: 'pull_secret', type: 'string?', desc: 'Secret for webhook endpoint authentication.' },
											{ key: 'disabled', type: 'bool?', desc: 'Skip this app during apply.' }
										] as row}
											<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
												<td class="px-4 py-3 font-mono text-rust text-xs whitespace-nowrap">{row.key}</td>
												<td class="px-4 py-3 font-mono text-zinc-500 text-xs whitespace-nowrap">{row.type}</td>
												<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>

						<div>
							<h3 class="doc-subheading">Profiles</h3>
							<p class="doc-text mb-4">
								Use <code class="code-inline">[apps.profiles.&lt;name&gt;]</code> to override fields per environment.
								Activate with <code class="code-inline">--env prod</code>.
							</p>
							<CodeBlock code={profilesExample} language="toml" filename="oxfile.toml" />
							<CodeBlock code="oxmgr apply ./oxfile.toml --env prod" language="bash" />
						</div>

						<div>
							<h3 class="doc-subheading">Instances — horizontal scaling</h3>
							<p class="doc-text mb-4">
								Expand one app entry into N managed processes. Each gets a unique name suffix and an <code class="code-inline">INSTANCE_ID</code> env var.
							</p>
							<CodeBlock code={instancesExample} language="toml" />
						</div>

						<div>
							<h3 class="doc-subheading">Node.js cluster mode</h3>
							<p class="doc-text mb-4">
								Fan-out a single managed entry using Node.js cluster. Command must be <code class="code-inline">node &lt;script&gt;</code> shape.
							</p>
							<CodeBlock code={clusterExample} language="toml" />
						</div>

						<div>
							<h3 class="doc-subheading">Deploy environments</h3>
							<p class="doc-text mb-4">
								Define remote deployment targets directly in your oxfile.
							</p>
							<CodeBlock code={deployExample} language="toml" />
							<CodeBlock code={`oxmgr deploy ./oxfile.toml production setup\noxmgr deploy ./oxfile.toml production`} language="bash" />
						</div>
					</div>
				</section>

				<!-- Health Checks -->
				<section id="health-checks" class="scroll-mt-24">
					<h2 class="doc-heading">Health Checks</h2>
					<p class="doc-text mb-6">
						Command-based health checks are polled periodically. After <code class="code-inline">health_max_failures</code> consecutive failures,
						the process is automatically restarted.
					</p>
					<CodeBlock code={healthExample} language="toml" filename="oxfile.toml" />
					<div class="mt-6 grid sm:grid-cols-2 gap-3">
						{#each [
							{ label: 'Polling interval', value: 'health_interval_secs (default: 30s)' },
							{ label: 'Check timeout', value: 'health_timeout_secs (default: 5s)' },
							{ label: 'Restart trigger', value: 'After health_max_failures (default: 3)' },
							{ label: 'Exit code', value: 'Non-zero = failure, zero = healthy' }
						] as item}
							<div class="border border-zinc-800 rounded bg-zinc-900/30 px-4 py-3">
								<p class="text-xs font-mono text-zinc-500 mb-1">{item.label}</p>
								<p class="text-sm text-zinc-300 font-mono">{item.value}</p>
							</div>
						{/each}
					</div>
				</section>

				<!-- Resource Limits -->
				<section id="resource-limits" class="scroll-mt-24">
					<h2 class="doc-heading">Resource Limits</h2>
					<p class="doc-text mb-6">
						Oxmgr monitors resource usage during daemon maintenance ticks. When limits are exceeded,
						the process is restarted. If the restart budget is exhausted, it's marked <code class="code-inline">errored</code>.
					</p>
					<CodeBlock code={resourceExample} language="toml" filename="oxfile.toml" />
					<div class="mt-6 border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
						<h3 class="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
							<svg class="w-4 h-4 text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
								<circle cx="8" cy="8" r="6.5" />
								<path d="M8 5v4M8 11v.5" stroke-linecap="round" />
							</svg>
							Platform notes
						</h3>
						<ul class="text-zinc-500 text-sm space-y-1.5">
							<li><span class="text-rust mr-2">—</span><code class="code-inline">cgroup_enforce</code> requires Linux with cgroup v2 enabled (modern kernels).</li>
							<li><span class="text-rust mr-2">—</span><code class="code-inline">deny_gpu</code> is best-effort: disables common GPU env vars but doesn't prevent hardware access.</li>
							<li><span class="text-rust mr-2">—</span>Memory and CPU limits apply on all platforms via daemon polling.</li>
						</ul>
					</div>
				</section>

				<!-- System Services -->
				<section id="system-services" class="scroll-mt-24">
					<h2 class="doc-heading">System Services</h2>
					<p class="doc-text mb-6">
						Install the Oxmgr daemon as a system service so it starts automatically on boot.
						<code class="code-inline">--system auto</code> detects your platform.
					</p>
					<CodeBlock code={serviceExample} language="bash" />
					<div class="mt-6 grid sm:grid-cols-3 gap-3">
						{#each [
							{ platform: 'Linux', system: 'systemd', icon: '🐧' },
							{ platform: 'macOS', system: 'launchd', icon: '🍎' },
							{ platform: 'Windows', system: 'Task Scheduler', icon: '🪟' }
						] as item}
							<div class="border border-zinc-800 rounded bg-zinc-900/30 px-4 py-3 text-center">
								<p class="text-2xl mb-2">{item.icon}</p>
								<p class="text-sm font-semibold text-zinc-300">{item.platform}</p>
								<p class="text-xs font-mono text-zinc-500 mt-1">{item.system}</p>
							</div>
						{/each}
					</div>
					<div class="mt-4">
						<CodeBlock code={`# Run oxmgr doctor to check daemon health\noxmgr doctor`} language="bash" />
					</div>
				</section>

				<!-- Git & Webhooks -->
				<section id="git-webhooks" class="scroll-mt-24">
					<h2 class="doc-heading">Git &amp; Webhooks</h2>
					<p class="doc-text mb-6">
						Enable auto-deployment by connecting a process to a git repository.
						<code class="code-inline">oxmgr pull</code> fetches the latest code and reloads/restarts
						only when the commit changed.
					</p>

					<div class="space-y-6">
						<div>
							<h3 class="doc-subheading">Configure in oxfile.toml</h3>
							<CodeBlock code={gitWebhookExample} language="toml" filename="oxfile.toml" />
						</div>

						<div>
							<h3 class="doc-subheading">Manual pull</h3>
							<CodeBlock code={`oxmgr pull api       # pull specific process\noxmgr pull           # pull all git-tracked processes`} language="bash" />
						</div>

						<div>
							<h3 class="doc-subheading">Webhook endpoint</h3>
							<p class="doc-text mb-4">
								The daemon exposes an HTTP webhook. Point your CI/CD or GitHub Actions to this endpoint
								to trigger automatic deploys on push.
							</p>
							<CodeBlock code={webhookCurl} language="bash" />
							<div class="mt-3 card overflow-hidden">
								<table class="w-full text-sm">
									<tbody>
										{#each [
											{ label: 'Endpoint', value: 'POST /pull/<name|id>' },
											{ label: 'Auth header', value: 'X-Oxmgr-Secret: <pull_secret>' },
											{ label: 'Alt auth', value: 'Authorization: Bearer <pull_secret>' },
											{ label: 'Bind address', value: 'OXMGR_API_ADDR env var (default: high localhost port)' }
										] as row}
											<tr class="border-b border-zinc-800/60 last:border-0">
												<td class="px-4 py-2.5 text-zinc-500 text-xs font-mono w-32">{row.label}</td>
												<td class="px-4 py-2.5 text-zinc-300 text-xs font-mono">{row.value}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</section>

				<!-- PM2 Migration -->
				<section id="pm2-migration" class="scroll-mt-24">
					<h2 class="doc-heading">PM2 Migration</h2>
					<p class="doc-text mb-6">
						Oxmgr supports PM2's <code class="code-inline">ecosystem.config.json</code> for a smooth migration path.
						Import existing config directly, then convert to the native format at your own pace.
					</p>

					<div class="space-y-6">
						<CodeBlock code={pm2MigrateExample} language="bash" />

						<div>
							<h3 class="doc-subheading">Format comparison</h3>
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
											{ topic: 'Profiles', pm2: 'env_<name> pattern', ox: '[apps.profiles.<name>]' },
											{ topic: 'Dependencies', pm2: 'limited/indirect', ox: 'explicit depends_on' },
											{ topic: 'Crash-loop cutoff', pm2: 'compatibility only', ox: 'native crash_restart_limit' },
											{ topic: 'Apply idempotency', pm2: 'medium', ox: 'high' },
											{ topic: 'Readability at scale', pm2: 'medium', ox: 'high' },
											{ topic: 'Dynamic JS execution', pm2: 'yes (config.js)', ox: 'no (safer)' }
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
					</div>
				</section>

				<!-- Environment Variables -->
				<section id="env-vars" class="scroll-mt-24">
					<h2 class="doc-heading">Environment Variables</h2>
					<p class="doc-text mb-6">Configure Oxmgr behavior via environment variables.</p>
					<div class="card overflow-hidden">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-zinc-800 bg-zinc-900/50">
									<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Variable</th>
									<th class="text-left px-4 py-3 font-mono text-zinc-400 font-medium text-xs">Description</th>
								</tr>
							</thead>
							<tbody>
								{#each [
									{ key: 'OXMGR_HOME', desc: 'Custom Oxmgr data directory. Default: ~/.local/share/oxmgr (Linux/macOS), %LOCALAPPDATA%\\oxmgr (Windows).' },
									{ key: 'OXMGR_DAEMON_ADDR', desc: 'Custom daemon bind address (host:port).' },
									{ key: 'OXMGR_API_ADDR', desc: 'HTTP API / webhook bind address. Default: high localhost port.' },
									{ key: 'OXMGR_LOG_MAX_SIZE_MB', desc: 'Log rotation size threshold in MB.' },
									{ key: 'OXMGR_LOG_MAX_FILES', desc: 'Number of rotated log files to retain.' },
									{ key: 'OXMGR_LOG_MAX_DAYS', desc: 'Rotated log retention period in days.' }
								] as row}
									<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
										<td class="px-4 py-3 font-mono text-rust text-xs whitespace-nowrap">{row.key}</td>
										<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>

			</div>

			<!-- Footer CTA -->
			<div class="mt-20 border border-zinc-800 rounded bg-zinc-900/30 p-6">
				<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
					<div class="flex-1">
						<h3 class="font-semibold text-white mb-1">Still have questions?</h3>
						<p class="text-zinc-400 text-sm">
							Open an issue or browse the source on GitHub.
						</p>
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

		</main>
	</div>
</div>

<style>
	.doc-heading {
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid theme('colors.zinc.800');
	}

	.doc-subheading {
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		font-size: 0.95rem;
		font-weight: 600;
		color: theme('colors.zinc.300');
		margin-bottom: 0.75rem;
	}

	.doc-text {
		color: theme('colors.zinc.400');
		font-size: 0.9rem;
		line-height: 1.7;
	}

	.doc-step-label {
		font-family: 'Space Mono', monospace;
		font-size: 0.75rem;
		color: theme('colors.rust.DEFAULT', #E8572A);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
	}
</style>
