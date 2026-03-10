<script lang="ts">
	import { page } from '$app/stores';

	const navItems = [
		{ href: '/docs', label: 'Quick Start' },
		{ href: '/docs/installation', label: 'Installation' },
		{ href: '/docs/cli-reference', label: 'CLI Reference' },
		{ href: '/docs/configuration', label: 'oxfile.toml' },
		{ href: '/docs/health-checks', label: 'Health Checks' },
		{ href: '/docs/resource-limits', label: 'Resource Limits' },
		{ href: '/docs/system-services', label: 'System Services' },
		{ href: '/docs/git-webhooks', label: 'Git & Webhooks' },
		{ href: '/docs/pm2-migration', label: 'PM2 Migration' },
		{ href: '/docs/environment-variables', label: 'Environment Variables' }
	];

	let mobileNavOpen = false;

	$: currentPath = $page.url.pathname.replace(/\/$/, '') || '/docs';
</script>

<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-24">
	<div class="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12 xl:gap-16">

		<!-- Sidebar (desktop) -->
		<aside class="hidden lg:block">
			<div class="sticky top-24">
				<p class="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4 px-1">Documentation</p>
				<nav class="space-y-0.5">
					{#each navItems as item}
						<a
							href={item.href}
							class="block px-3 py-2 text-sm font-mono rounded transition-colors {currentPath === item.href ? 'text-white bg-zinc-800/70' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'}"
						>
							{item.label}
						</a>
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

			<!-- Mobile nav toggle -->
			<div class="lg:hidden mb-8">
				<button
					on:click={() => (mobileNavOpen = !mobileNavOpen)}
					class="flex items-center gap-2 text-sm font-mono text-zinc-400 border border-zinc-800
					       bg-zinc-900/60 rounded px-4 py-2.5 w-full hover:border-zinc-700 transition-colors"
				>
					<svg class="w-4 h-4 text-zinc-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M2 4h12M2 8h8M2 12h10" stroke-linecap="round"/>
					</svg>
					<span>Documentation</span>
					<svg class="w-4 h-4 ml-auto text-zinc-600 transition-transform {mobileNavOpen ? 'rotate-180' : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				{#if mobileNavOpen}
					<div class="mt-1 border border-zinc-800 rounded bg-zinc-900/80 overflow-hidden">
						{#each navItems as item}
							<a
								href={item.href}
								on:click={() => (mobileNavOpen = false)}
								class="block px-4 py-2.5 text-sm font-mono border-b border-zinc-800/60 last:border-0 transition-colors {currentPath === item.href ? 'text-white bg-zinc-800/50' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'}"
							>
								{item.label}
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<slot />

		</main>
	</div>
</div>

<style>
	:global(.doc-heading) {
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid theme('colors.zinc.800');
	}

	:global(.doc-subheading) {
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		font-size: 0.95rem;
		font-weight: 600;
		color: theme('colors.zinc.300');
		margin-bottom: 0.75rem;
	}

	:global(.doc-text) {
		color: theme('colors.zinc.400');
		font-size: 0.9rem;
		line-height: 1.7;
	}

	:global(.doc-step-label) {
		font-family: 'Space Mono', monospace;
		font-size: 0.75rem;
		color: theme('colors.rust.DEFAULT', #E8572A);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
	}
</style>
