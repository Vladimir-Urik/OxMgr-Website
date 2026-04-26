<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';
</script>

<svelte:head>
	<title>CLI Reference — Oxmgr Docs</title>
	<meta name="description" content="Complete Oxmgr CLI reference. All commands, flags, and keyboard shortcuts for managing processes, applying configs, and running the interactive terminal UI." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/cli-reference" />
	<meta property="og:title" content="Oxmgr CLI Reference" />
	<meta property="og:description" content="All Oxmgr commands, flags, and keyboard shortcuts — runtime monitoring, lifecycle management, config commands, and more." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/cli-reference" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">CLI Reference</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		All commands grouped by category. Run <code class="code-inline">oxmgr --help</code> or <code class="code-inline">oxmgr &lt;command&gt; --help</code> for inline help.
	</p>
</div>

<div class="space-y-10">

	<!-- Runtime & monitoring -->
	<div>
		<h2 class="doc-heading">Runtime &amp; Monitoring</h2>
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
						{ cmd: 'oxmgr logs <name> [-f] [--lines <n>]', alias: 'log', desc: 'Stream or show logs. oxmgr logs all prints recent logs for every process.' },
						{ cmd: 'oxmgr ui [--interval-ms <n>]', alias: '', desc: 'Interactive terminal UI with keyboard + mouse' },
						{ cmd: 'oxmgr runtime <config> [--env <profile>] [--only a,b]', alias: '', desc: 'Foreground/container mode — no daemon, runs processes and forwards logs to stdout/stderr' }
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

	<!-- Lifecycle -->
	<div>
		<h2 class="doc-heading">Lifecycle</h2>
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
						{ cmd: 'oxmgr stop <name|config>', alias: '', desc: 'Stop a running process. stop all stops every managed process.' },
						{ cmd: 'oxmgr restart <name|config>', alias: 'rs', desc: 'Restart a process (resets crash-loop counter). restart all restarts all.' },
						{ cmd: 'oxmgr reload <name>', alias: '', desc: 'Graceful reload (zero-downtime where supported)' },
						{ cmd: 'oxmgr pull [name]', alias: '', desc: 'Git pull + reload/restart only if commit changed. Without target pulls all git-tracked.' },
						{ cmd: 'oxmgr delete <name|config>', alias: 'rm', desc: 'Stop and remove from daemon state. delete all removes all.' }
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

	<!-- Start options -->
	<div>
		<h2 class="doc-heading">Start Options</h2>
		<p class="doc-text mb-4">All flags supported by <code class="code-inline">oxmgr start</code>. These correspond directly to <a href="/docs/configuration" class="text-zinc-300 hover:text-white underline underline-offset-2">oxfile.toml fields</a>.</p>
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
						{ flag: '--watch-path <path>', def: '', desc: 'Explicit path to watch (repeatable). Requires --watch.' },
						{ flag: '--ignore-watch <regex>', def: '', desc: 'Ignore paths matching regex during watch scans (repeatable).' },
						{ flag: '--watch-delay <s>', def: '0', desc: 'Restart debounce after file-watch change. Requires --watch.' },
						{ flag: '--health-cmd <cmd>', def: '', desc: 'Command polled to verify health' },
						{ flag: '--health-interval <s>', def: '30', desc: 'Seconds between health checks' },
						{ flag: '--health-timeout <s>', def: '5', desc: 'Timeout for each health check' },
						{ flag: '--health-max-failures <n>', def: '3', desc: 'Failures before restart' },
						{ flag: '--wait-ready', def: 'false', desc: 'Gate start/reload on health check readiness. Requires --health-cmd.' },
						{ flag: '--ready-timeout <s>', def: '30', desc: 'Timeout for readiness check. Requires --wait-ready.' },
						{ flag: '--kill-signal <signal>', def: 'SIGTERM', desc: 'Signal sent to process on stop/reload.' },
						{ flag: '--stop-timeout <s>', def: '5', desc: 'Grace period before force-kill' },
						{ flag: '--restart-delay <s>', def: '0', desc: 'Delay between auto-restarts' },
						{ flag: '--start-delay <s>', def: '0', desc: 'Delay before initial process start' },
						{ flag: '--cluster', def: 'false', desc: 'Node.js cluster mode' },
						{ flag: '--cluster-instances <n>', def: 'all CPUs', desc: 'Worker count (requires --cluster)' },
						{ flag: '--namespace <name>', def: '', desc: 'Group process under a namespace' },
						{ flag: '--max-memory-mb <n>', def: '', desc: 'Memory limit in MB' },
						{ flag: '--max-cpu-percent <n>', def: '', desc: 'CPU usage limit (%)' },
						{ flag: '--cgroup-enforce', def: 'false', desc: 'Apply hard limits via Linux cgroup v2 at spawn time' },
						{ flag: '--deny-gpu', def: 'false', desc: 'Best-effort GPU disable via env vars' },
						{ flag: '--pre-reload-cmd <cmd>', def: '', desc: 'Command run before reload. Reload aborts if this fails.' },
						{ flag: '--reuse-port', def: 'false', desc: 'Best-effort SO_REUSEPORT hint (macOS/Linux only)' },
						{ flag: '--log-date-format <fmt>', def: '', desc: 'Prefix each log line with a timestamp (e.g. "%Y-%m-%d %H:%M:%S")' },
						{ flag: '--cron-restart <expr>', def: '', desc: '6-field cron expression for scheduled restarts (e.g. "0 0 2 * * *" = daily at 2 AM)' }
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

	<!-- Config commands -->
	<div>
		<h2 class="doc-heading">Config Commands</h2>
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

	<!-- Deploy commands -->
	<div>
		<h2 class="doc-heading">Deploy Commands</h2>
		<p class="doc-text mb-4">PM2-style remote deployment. Requires a <code class="code-inline">[deploy.&lt;env&gt;]</code> block in your <a href="/docs/configuration" class="text-zinc-300 hover:text-white underline underline-offset-2">oxfile.toml</a>.</p>
		<div class="card overflow-hidden">
			<table class="w-full text-sm">
				<tbody>
					{#each [
						{ cmd: 'oxmgr deploy <config> <env> setup', desc: 'Initial server setup for a deploy environment.' },
						{ cmd: 'oxmgr deploy <config> <env> update [--force]', desc: 'Deploy latest commit to remote.' },
						{ cmd: 'oxmgr deploy <config> <env> revert [n]', desc: 'Roll back N releases (default 1).' },
						{ cmd: 'oxmgr deploy <config> <env> current', desc: 'Show current deployed release.' },
						{ cmd: 'oxmgr deploy <config> <env> list', desc: 'List all releases on remote.' },
						{ cmd: 'oxmgr deploy <config> <env> exec "<cmd>"', desc: 'Run a command in the current release directory.' }
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

	<!-- Service & Daemon -->
	<div>
		<h2 class="doc-heading">Service &amp; Daemon</h2>
		<div class="card overflow-hidden">
			<table class="w-full text-sm">
				<tbody>
					{#each [
						{ cmd: 'oxmgr doctor', desc: 'Check daemon health, IPC reachability, filesystem layout, cgroup prerequisites, and more.' },
						{ cmd: 'oxmgr startup [--system <auto|systemd|launchd|task-scheduler>]', desc: 'Enable daemon autostart on boot (convenience shorthand).' },
						{ cmd: 'oxmgr service install [--system <...>]', desc: 'Install daemon as a system service.' },
						{ cmd: 'oxmgr service status [--system <...>]', desc: 'Show system service status.' },
						{ cmd: 'oxmgr service uninstall [--system <...>]', desc: 'Remove system service registration.' },
						{ cmd: 'oxmgr daemon run', desc: 'Start the Oxmgr daemon process.' },
						{ cmd: 'oxmgr daemon stop', desc: 'Stop the running daemon.' }
					] as row}
						<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
							<td class="px-4 py-3 font-mono text-zinc-200 text-xs align-top whitespace-nowrap pr-6">{row.cmd}</td>
							<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="doc-text mt-3">
			<code class="code-inline">--system auto</code> resolves to <code class="code-inline">systemd</code> on Linux, <code class="code-inline">launchd</code> on macOS, and <code class="code-inline">task-scheduler</code> on Windows.
			See <a href="/docs/system-services" class="text-zinc-300 hover:text-white underline underline-offset-2">System Services</a>.
		</p>
	</div>

	<!-- Keyboard shortcuts -->
	<div>
		<h2 class="doc-heading">Interactive UI — Keyboard Shortcuts</h2>
		<p class="doc-text mb-4">Launch the TUI with <code class="code-inline">oxmgr ui</code>. Mouse supported — click to select, scroll to navigate.</p>
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
