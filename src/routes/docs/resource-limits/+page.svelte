<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const resourceExample = `[[apps]]
name = "api"
command = "node server.js"
max_memory_mb = 512
max_cpu_percent = 80.0
cgroup_enforce = true  # Linux only — hard limits via cgroup v2
deny_gpu = true        # best-effort GPU disable`;
</script>

<svelte:head>
	<title>Resource Limits — Oxmgr Docs</title>
	<meta name="description" content="Set memory and CPU limits for processes managed by Oxmgr. Supports soft limits via polling and hard limits via Linux cgroup v2." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/resource-limits" />
	<meta property="og:title" content="Oxmgr Resource Limits" />
	<meta property="og:description" content="Memory and CPU limits for Oxmgr-managed processes. Polling-based soft limits and Linux cgroup v2 hard limits." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/resource-limits" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Resource Limits</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Oxmgr monitors resource usage during daemon maintenance ticks. When limits are exceeded,
		the process is restarted. If the restart budget is exhausted, it's marked <code class="code-inline">errored</code>.
	</p>
</div>

<div class="space-y-10">

	<div>
		<h2 class="doc-heading">Configuration</h2>
		<CodeBlock code={resourceExample} language="toml" filename="oxfile.toml" />
	</div>

	<div>
		<h2 class="doc-heading">Field Reference</h2>
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
						{ key: 'max_memory_mb', type: 'int?', desc: 'Memory limit in MB. Daemon polls RSS and restarts the process if exceeded.' },
						{ key: 'max_cpu_percent', type: 'float?', desc: 'CPU usage limit as a percentage. Triggers restart if exceeded.' },
						{ key: 'cgroup_enforce', type: 'bool?', desc: 'Linux only. Apply hard resource limits via cgroup v2 at spawn time. Requires kernel 5.2+ with cgroup v2 enabled.' },
						{ key: 'deny_gpu', type: 'bool?', desc: 'Best-effort GPU disable. Sets common GPU-access env vars to disabled at spawn time.' }
					] as row}
						<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20">
							<td class="px-4 py-3 font-mono text-rust text-xs whitespace-nowrap">{row.key}</td>
							<td class="px-4 py-3 font-mono text-zinc-500 text-xs">{row.type}</td>
							<td class="px-4 py-3 text-zinc-400 text-sm">{row.desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div>
		<h2 class="doc-heading">How Limits Work</h2>
		<div class="grid sm:grid-cols-2 gap-4">
			<div class="border border-zinc-800 rounded bg-zinc-900/30 px-5 py-4">
				<h3 class="text-sm font-semibold text-zinc-300 mb-2">Soft limits (all platforms)</h3>
				<p class="doc-text">
					<code class="code-inline">max_memory_mb</code> and <code class="code-inline">max_cpu_percent</code> work via
					daemon polling — Oxmgr samples usage periodically and restarts the process when a limit is exceeded.
					This is available on Linux, macOS, and Windows.
				</p>
			</div>
			<div class="border border-zinc-800 rounded bg-zinc-900/30 px-5 py-4">
				<h3 class="text-sm font-semibold text-zinc-300 mb-2">Hard limits (Linux, cgroup v2)</h3>
				<p class="doc-text">
					<code class="code-inline">cgroup_enforce = true</code> places the process in a cgroup v2 slice with kernel-enforced
					memory limits. The kernel kills the process (OOM kill) if it exceeds the limit — no polling delay.
					Requires Linux kernel 5.2+ with cgroup v2 enabled.
				</p>
			</div>
		</div>
	</div>

	<div class="border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
		<h3 class="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
			<svg class="w-4 h-4 text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="8" cy="8" r="6.5" />
				<path d="M8 5v4M8 11v.5" stroke-linecap="round" />
			</svg>
			Platform notes
		</h3>
		<ul class="text-zinc-500 text-sm space-y-1.5">
			<li><span class="text-rust mr-2">—</span><code class="code-inline">cgroup_enforce</code> requires Linux with cgroup v2 enabled. Check with: <code class="code-inline">mount | grep cgroup2</code></li>
			<li><span class="text-rust mr-2">—</span><code class="code-inline">deny_gpu</code> is best-effort: disables common GPU env vars but doesn't prevent hardware access at kernel level.</li>
			<li><span class="text-rust mr-2">—</span>Memory and CPU limits apply on all platforms via daemon polling.</li>
			<li><span class="text-rust mr-2">—</span>If a process is OOM-killed by the kernel, it shows as an unexpected exit and triggers the normal restart policy.</li>
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
