<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

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

	const watchExample = `[[apps]]
name = "api"
command = "node server.js"
watch = ["src", "package.json"]   # bool, string, or array of paths
ignore_watch = ["target/", "\\.log$"]  # regex patterns
watch_delay_secs = 2               # debounce restart`;

	const waitReadyExample = `[[apps]]
name = "api"
command = "node server.js"
health_cmd = "curl -fsS http://127.0.0.1:3000/health"
wait_ready = true
ready_timeout_secs = 30  # fail reload if not ready within 30s`;

	const preReloadExample = `[[apps]]
name = "api"
command = "./target/release/api"
pre_reload_cmd = "cargo build --release"
# Build runs before reload. If build fails, old process keeps running.`;

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
	<title>oxfile.toml Configuration — Oxmgr Docs</title>
	<meta name="description" content="Complete oxfile.toml reference. All fields, profiles, instances, cluster mode, file watch, readiness-aware reloads, and deploy environments." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/configuration" />
	<meta property="og:title" content="oxfile.toml Configuration Reference" />
	<meta property="og:description" content="Full field reference for Oxmgr's oxfile.toml: profiles, instances, clustering, health checks, file watch, and deploy environments." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/configuration" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">oxfile.toml</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Native Oxmgr configuration format. Designed for deterministic, idempotent process management via <code class="code-inline">oxmgr apply</code>.
	</p>
</div>

<div class="space-y-10">

	<div>
		<h2 class="doc-heading">File Structure</h2>
		<CodeBlock code={`version = 1\n\n[defaults]\n# optional defaults for all apps\n\n[[apps]]\n# repeated app entries`} language="toml" />
		<p class="doc-text mt-3">
			The <code class="code-inline">[[apps]]</code> array is TOML's array-of-tables syntax — each <code class="code-inline">[[apps]]</code> block defines one managed process.
		</p>
	</div>

	<div>
		<h2 class="doc-heading">Full Field Reference</h2>
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
						{ key: 'health_cmd', type: 'string?', desc: 'Command polled to verify process health. e.g. "curl -fsS http://127.0.0.1:3000/health"' },
						{ key: 'health_interval_secs', type: 'int?', desc: 'Seconds between health checks. Default 30.' },
						{ key: 'health_timeout_secs', type: 'int?', desc: 'Timeout per health check. Default 5.' },
						{ key: 'health_max_failures', type: 'int?', desc: 'Failures before process restart. Default 3.' },
						{ key: 'wait_ready', type: 'bool?', desc: 'Gate reload on health check readiness. Old process stays up until new one passes. Requires health_cmd.' },
						{ key: 'ready_timeout_secs', type: 'int?', desc: 'Timeout for readiness during reload. Reload aborts if exceeded. Default 30.' },
						{ key: 'pre_reload_cmd', type: 'string?', desc: 'Command run before reload (e.g. build step). Reload aborts on failure.' },
						{ key: 'watch', type: 'bool|string|string[]?', desc: 'Watch paths for changes and auto-restart. true = watch cwd.' },
						{ key: 'ignore_watch', type: 'string[]?', desc: 'Regex patterns for paths to ignore during watch.' },
						{ key: 'watch_delay_secs', type: 'int?', desc: 'Debounce delay before restarting after file change.' },
						{ key: 'reuse_port', type: 'bool?', desc: 'Best-effort SO_REUSEPORT hint. Sets OXMGR_REUSEPORT=1 in child env (macOS/Linux).' },
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
		<h2 class="doc-heading">Profiles</h2>
		<p class="doc-text mb-4">
			Use <code class="code-inline">[apps.profiles.&lt;name&gt;]</code> to override fields per environment.
			Activate with <code class="code-inline">--env prod</code>.
		</p>
		<CodeBlock code={profilesExample} language="toml" filename="oxfile.toml" />
		<CodeBlock code="oxmgr apply ./oxfile.toml --env prod" language="bash" />
	</div>

	<div>
		<h2 class="doc-heading">Instances — Horizontal Scaling</h2>
		<p class="doc-text mb-4">
			Expand one app entry into N managed processes. Each gets a unique name suffix and an <code class="code-inline">INSTANCE_ID</code> env var.
		</p>
		<CodeBlock code={instancesExample} language="toml" />
	</div>

	<div>
		<h2 class="doc-heading">Node.js Cluster Mode</h2>
		<p class="doc-text mb-4">
			Fan-out a single managed entry using Node.js cluster. Command must be <code class="code-inline">node &lt;script&gt;</code> shape.
		</p>
		<CodeBlock code={clusterExample} language="toml" />
	</div>

	<div>
		<h2 class="doc-heading">File Watch</h2>
		<p class="doc-text mb-4">
			Auto-restart when source files change. <code class="code-inline">watch</code> accepts a boolean, a single path, or an array of paths.
			Use <code class="code-inline">ignore_watch</code> for regex-based exclusions and <code class="code-inline">watch_delay_secs</code> to debounce rapid changes.
		</p>
		<CodeBlock code={watchExample} language="toml" />
	</div>

	<div>
		<h2 class="doc-heading">Readiness-Aware Reload</h2>
		<p class="doc-text mb-4">
			With <code class="code-inline">wait_ready = true</code>, a reload waits for the new instance to pass the health check before cutting over.
			If readiness times out, the old process keeps running — zero user impact on a failed deploy.
		</p>
		<CodeBlock code={waitReadyExample} language="toml" />
		<p class="doc-text mt-3">
			See <a href="/docs/health-checks" class="text-zinc-300 hover:text-white underline underline-offset-2">Health Checks</a> for the full health check configuration reference.
		</p>
	</div>

	<div>
		<h2 class="doc-heading">Pre-Reload Build Hook</h2>
		<p class="doc-text mb-4">
			<code class="code-inline">pre_reload_cmd</code> runs before any reload attempt.
			If it exits non-zero, the reload is aborted and the current process keeps running.
		</p>
		<CodeBlock code={preReloadExample} language="toml" />
	</div>

	<div>
		<h2 class="doc-heading">Deploy Environments</h2>
		<p class="doc-text mb-4">
			Define remote deployment targets directly in your oxfile.
		</p>
		<CodeBlock code={deployExample} language="toml" />
		<CodeBlock code={`oxmgr deploy ./oxfile.toml production setup\noxmgr deploy ./oxfile.toml production`} language="bash" />
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
