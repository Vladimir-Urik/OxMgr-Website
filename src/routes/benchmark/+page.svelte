<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;

	function formatDate(iso: string): string {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleDateString('en-US', {
				year: 'numeric', month: 'short', day: 'numeric',
				hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
			});
		} catch {
			return iso;
		}
	}
</script>

<svelte:head>
	<title>Benchmarks — Oxmgr</title>
	<meta name="description" content="Detailed performance benchmarks comparing Oxmgr vs PM2: boot time, memory usage, crash recovery speed, and more." />
	<link rel="canonical" href="https://oxmgr.dev/benchmark" />
	<meta property="og:title" content="Oxmgr vs PM2 — Performance Benchmarks" />
	<meta property="og:description" content="Boot time, memory usage, crash recovery speed, and more. Automated benchmarks run on every push." />
	<meta property="og:url" content="https://oxmgr.dev/benchmark" />
	<meta name="twitter:title" content="Oxmgr vs PM2 — Performance Benchmarks" />
	<meta name="twitter:description" content="Boot time 3.9× faster, 20× lower memory, 42× faster crash recovery. Real automated benchmarks." />
</svelte:head>

<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-24">
	<!-- Header -->
	<div class="mb-10 sm:mb-12">
		<p class="section-label">Performance</p>
		<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Oxmgr vs PM2 — Benchmarks</h1>
		<p class="text-zinc-400 text-base sm:text-lg max-w-2xl leading-relaxed">
			Automated benchmarks run on every push. Numbers reflect real-world process management
			workloads, not synthetic microbenchmarks.
		</p>

		<!-- Meta row: version + update time -->
		<div class="flex flex-wrap items-center gap-3 mt-4">
			<span class="inline-flex items-center gap-1.5 text-xs font-mono border border-zinc-800 bg-zinc-900/60 rounded-full px-3 py-1.5">
				<span class="text-zinc-500">latest</span>
				<span class="text-rust font-bold">v{data.latestVersion}</span>
			</span>

			{#if data.fromGitHub && data.generatedAt}
				<span class="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-500 border border-emerald-900/50 bg-emerald-950/40 rounded-full px-3 py-1.5">
					<svg class="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M1 6a5 5 0 1010 0A5 5 0 001 6z"/>
						<path d="M6 3.5V6l2 1.5" stroke-linecap="round"/>
					</svg>
					Updated {formatDate(data.generatedAt)}
				</span>
			{:else if data.fromGitHub}
				<span class="text-xs font-mono text-emerald-500">✓ Live data from GitHub</span>
			{:else}
				<span class="text-xs font-mono text-zinc-600">Using compiled-in data</span>
			{/if}

			<a
				href="https://github.com/Vladimir-Urik/OxMgr/blob/master/benchmark.json"
				target="_blank"
				rel="noopener noreferrer"
				class="text-xs font-mono text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
			>
				Raw benchmark.json
				<svg class="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M2 2h8v8M10 2L2 10" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</a>
		</div>
	</div>

	<!-- Results table -->
	<div class="card overflow-hidden mb-12">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-zinc-800 bg-zinc-900/50">
						<th class="text-left px-4 sm:px-5 py-3.5 font-mono text-zinc-400 font-medium text-xs uppercase tracking-wide">
							Metric
						</th>
						<th class="text-right px-4 sm:px-5 py-3.5 font-mono text-rust font-medium text-xs uppercase tracking-wide">
							Oxmgr
						</th>
						<th class="text-right px-4 sm:px-5 py-3.5 font-mono text-zinc-500 font-medium text-xs uppercase tracking-wide">
							PM2
						</th>
						<th class="text-right px-4 sm:px-5 py-3.5 font-mono text-zinc-400 font-medium text-xs uppercase tracking-wide">
							Ratio
						</th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row}
						<tr class="border-b border-zinc-800/60 last:border-0 {row.highlight ? 'bg-rust/[0.03]' : ''}">
							<td class="px-4 sm:px-5 py-4 text-zinc-200 font-medium text-sm">{row.metric}</td>
							<td class="px-4 sm:px-5 py-4 text-right font-mono font-semibold text-sm
							       {row.highlight ? 'text-rust' : 'text-zinc-200'}">
								{row.oxmgr}
							</td>
							<td class="px-4 sm:px-5 py-4 text-right font-mono text-zinc-500 text-sm">{row.pm2}</td>
							<td class="px-4 sm:px-5 py-4 text-right">
								{#if row.ratio}
									<span class="inline-flex items-center font-mono text-xs px-2 py-1 rounded
									       {row.highlight
										? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50'
										: 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/50'}">
										{row.ratio}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Methodology -->
	<div class="space-y-8">
		<section>
			<h2 class="text-xl font-display font-bold text-white mb-3">Methodology</h2>
			<div class="text-zinc-400 leading-relaxed space-y-3 text-sm">
				<p>
					Benchmarks are executed automatically via GitHub Actions on Ubuntu runners for every
					push to the main branch. The workload simulates real process management scenarios:
					starting, stopping, and restarting Node.js HTTP servers.
				</p>
				<ul class="space-y-2 list-none">
					{#each [
						{ label: 'Environment', value: 'GitHub Actions Ubuntu (latest), Linux 6.14 on Azure' },
						{ label: 'Workload', value: 'Idle Node.js HTTP server — single process and fleet of 100' },
						{ label: 'Measurement', value: 'Median of 5 runs for each metric' },
						{ label: 'TCP readiness', value: 'Polling localhost:3000 until first successful connection' }
					] as item}
						<li class="flex gap-3">
							<span class="text-rust mt-0.5 shrink-0">—</span>
							<span><strong class="text-zinc-300">{item.label}:</strong> {item.value}</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>

		<!-- Disclaimer -->
		<section class="border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
			<h3 class="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
				<svg class="w-4 h-4 text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="8" cy="8" r="6.5" />
					<path d="M8 5v4M8 11v.5" stroke-linecap="round" />
				</svg>
				Important caveat
			</h3>
			<p class="text-zinc-500 text-sm leading-relaxed">
				GitHub-hosted runners share infrastructure and exhibit non-trivial measurement noise.
				Treat these numbers as directional trend signals, not absolute lab measurements.
				The relative differences are consistent across runs, but absolute timing values will vary
				depending on host load.
			</p>
		</section>

		<!-- Run it yourself -->
		<section>
			<h2 class="text-xl font-display font-bold text-white mb-3">Run it yourself</h2>
			<p class="text-zinc-400 text-sm mb-4">
				The benchmark script is included in the repository. Requires Python 3, Node.js, and both
				<code class="code-inline">oxmgr</code> and <code class="code-inline">pm2</code> installed.
			</p>
			<div class="card overflow-hidden">
				<div class="bg-zinc-900 px-4 py-2.5 border-b border-zinc-800">
					<span class="text-xs font-mono text-zinc-400">Clone and run</span>
				</div>
				<div class="bg-[#0d0d0d] p-4 font-mono text-sm space-y-1.5 text-zinc-300 overflow-x-auto">
					<div><span class="text-zinc-500 mr-2">$</span>git clone https://github.com/Vladimir-Urik/OxMgr.git</div>
					<div><span class="text-zinc-500 mr-2">$</span>cd OxMgr</div>
					<div><span class="text-zinc-500 mr-2">$</span>python3 scripts/benchmark_oxmgr_vs_pm2.py</div>
				</div>
			</div>
		</section>
	</div>
</div>
