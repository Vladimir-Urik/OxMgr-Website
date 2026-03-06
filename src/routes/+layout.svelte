<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData;
</script>

<Nav version={data.latestVersion} />
<main>
	<slot />
</main>

<footer class="border-t border-zinc-800 mt-auto">
	<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
			<a href="/" class="font-mono font-bold text-base tracking-tight shrink-0">
				<span class="text-rust">ox</span><span class="text-white">mgr</span>
			</a>
			<div class="flex items-center gap-4 sm:gap-6 text-sm flex-wrap">
				<a href="/benchmark" class="text-zinc-500 hover:text-white transition-colors">Benchmarks</a>
				<a href="/docs" class="text-zinc-500 hover:text-white transition-colors">Docs</a>
				<a
					href="https://github.com/Vladimir-Urik/OxMgr"
					target="_blank"
					rel="noopener noreferrer"
					class="text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5"
				>
					<svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
						<path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
						/>
					</svg>
					GitHub
				</a>
				<span class="border border-zinc-700 text-zinc-400 px-2 py-0.5 text-xs rounded font-mono">MIT License</span>
			</div>
		</div>
		<p class="text-xs text-zinc-600 mt-5 sm:mt-4">
			Built by <a
				href="https://github.com/Vladimir-Urik"
				target="_blank"
				rel="noopener noreferrer"
				class="text-zinc-500 hover:text-white transition-colors">Vladimír Urík</a
			> · Empellio
		</p>
		<p class="text-xs text-zinc-600 mt-2">
			We use <a
				href="https://umami.is"
				target="_blank"
				rel="noopener noreferrer"
				class="text-zinc-500 hover:text-white transition-colors">self-hosted Umami Analytics</a
			> for simple aggregate visitor stats.
		</p>
	</div>
</footer>
