<svelte:head>
	<title>Environment Variables — Oxmgr Docs</title>
	<meta name="description" content="Configure the Oxmgr daemon behavior with environment variables. OXMGR_HOME, OXMGR_API_ADDR, log rotation settings, and more." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/environment-variables" />
	<meta property="og:title" content="Oxmgr Environment Variables" />
	<meta property="og:description" content="All OXMGR_* environment variables for configuring the daemon: home directory, API address, and log rotation." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/environment-variables" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Environment Variables</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Configure Oxmgr daemon behavior via environment variables. Set these before starting the daemon.
	</p>
</div>

<div class="space-y-10">

	<div>
		<h2 class="doc-heading">Daemon Configuration</h2>
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
						{ key: 'OXMGR_HOME', desc: 'Custom Oxmgr data directory. Default: ~/.local/share/oxmgr (Linux/macOS), %LOCALAPPDATA%\\oxmgr (Windows). Process logs and state files are stored here.' },
						{ key: 'OXMGR_DAEMON_ADDR', desc: 'Custom daemon bind address (host:port). CLI communicates with the daemon over this address.' },
						{ key: 'OXMGR_API_ADDR', desc: 'HTTP API / webhook bind address. Default: high localhost port. Set this to expose the pull webhook and metrics endpoint.' },
						{ key: 'OXMGR_LOG_MAX_SIZE_MB', desc: 'Log rotation size threshold in MB. When a process log exceeds this size, it is rotated.' },
						{ key: 'OXMGR_LOG_MAX_FILES', desc: 'Number of rotated log files to retain per process.' },
						{ key: 'OXMGR_LOG_MAX_DAYS', desc: 'Rotated log retention period in days. Older files are deleted automatically.' }
					] as row}
						<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
							<td class="px-4 py-3 font-mono text-rust text-xs whitespace-nowrap align-top">{row.key}</td>
							<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div>
		<h2 class="doc-heading">Usage</h2>
		<p class="doc-text mb-4">
			Set these before the daemon starts. If you installed Oxmgr as a system service,
			add them to the service environment:
		</p>
		<div class="space-y-4">
			<div>
				<p class="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">Shell / .bashrc / .zshrc</p>
				<div class="bg-zinc-900 border border-zinc-800 rounded px-4 py-3 font-mono text-sm text-zinc-300">
					<p>export OXMGR_HOME=/data/oxmgr</p>
					<p>export OXMGR_LOG_MAX_SIZE_MB=100</p>
				</div>
			</div>
			<div>
				<p class="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">systemd service override</p>
				<div class="bg-zinc-900 border border-zinc-800 rounded px-4 py-3 font-mono text-sm text-zinc-300">
					<p class="text-zinc-600"># /etc/systemd/system/oxmgr.service.d/env.conf</p>
					<p>[Service]</p>
					<p>Environment=OXMGR_HOME=/data/oxmgr</p>
					<p>Environment=OXMGR_LOG_MAX_SIZE_MB=100</p>
				</div>
			</div>
		</div>
	</div>

	<div class="border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
		<h3 class="text-sm font-semibold text-zinc-300 mb-2">Note on OXMGR_API_ADDR</h3>
		<p class="doc-text">
			The API address is used for the pull webhook (<code class="code-inline">POST /pull/&lt;name&gt;</code>) and
			Prometheus metrics (<code class="code-inline">GET /metrics</code>). By default it binds to a high-numbered
			localhost port. Set <code class="code-inline">OXMGR_API_ADDR=0.0.0.0:8080</code> to expose it externally —
			but always protect it with a reverse proxy or firewall rule.
			See <a href="/docs/git-webhooks" class="text-zinc-300 hover:text-white underline underline-offset-2">Git &amp; Webhooks</a> for security guidance.
		</p>
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
