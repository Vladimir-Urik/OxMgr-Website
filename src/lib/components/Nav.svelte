<script lang="ts">
	import { page } from '$app/stores';
	import { fly } from 'svelte/transition';

	export let version: string = '0.1.1';

	let menuOpen = false;

	function close() {
		menuOpen = false;
	}
</script>

<nav class="fixed top-0 inset-x-0 z-50 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-md">
	<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
		<!-- Logo -->
		<a href="/" on:click={close} class="flex items-center gap-2 group shrink-0">
			<span class="font-mono font-bold text-lg tracking-tight">
				<span class="text-rust">ox</span><span class="text-white">mgr</span>
			</span>
			<span
				class="hidden sm:inline text-[10px] font-mono text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded
				       group-hover:border-zinc-600 group-hover:text-zinc-400 transition-colors"
			>
				v{version}
			</span>
		</a>

		<!-- Desktop links -->
		<div class="hidden sm:flex items-center gap-1">
			<a
				href="/benchmark"
				class="px-3 py-1.5 text-sm rounded transition-colors
				       {$page.url.pathname === '/benchmark'
					? 'text-white bg-zinc-800'
					: 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}"
			>
				Benchmarks
			</a>
			<a
				href="/docs"
				class="px-3 py-1.5 text-sm rounded transition-colors
				       {$page.url.pathname === '/docs'
					? 'text-white bg-zinc-800'
					: 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}"
			>
				Docs
			</a>
			<div class="w-px h-4 bg-zinc-800 mx-2" aria-hidden="true"></div>
			<a
				href="https://github.com/Vladimir-Urik/OxMgr"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-white
				       rounded border border-zinc-800 hover:border-zinc-600 transition-colors"
			>
				<svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				GitHub
			</a>
		</div>

		<!-- Mobile hamburger -->
		<button
			class="sm:hidden flex flex-col justify-center items-center gap-[5px] w-9 h-9 rounded
			       hover:bg-zinc-800/60 transition-colors"
			on:click={() => (menuOpen = !menuOpen)}
			aria-label="Toggle navigation"
			aria-expanded={menuOpen}
		>
			<span
				class="block w-5 h-px bg-zinc-200 transition-transform duration-300 origin-center
				       {menuOpen ? 'rotate-45 translate-y-[6px]' : ''}"
			></span>
			<span
				class="block w-5 h-px bg-zinc-200 transition-all duration-200
				       {menuOpen ? 'opacity-0 scale-x-0' : ''}"
			></span>
			<span
				class="block w-5 h-px bg-zinc-200 transition-transform duration-300 origin-center
				       {menuOpen ? '-rotate-45 -translate-y-[6px]' : ''}"
			></span>
		</button>
	</div>
</nav>

<!-- Mobile menu -->
{#if menuOpen}
	<div
		transition:fly={{ y: -8, duration: 180, opacity: 0 }}
		class="fixed top-14 inset-x-0 z-40 sm:hidden bg-zinc-950 border-b border-zinc-800 shadow-2xl"
	>
		<div class="px-4 py-3 flex flex-col gap-1">
			<a
				href="/benchmark"
				on:click={close}
				class="flex items-center px-4 py-3 text-sm rounded-md transition-colors
				       {$page.url.pathname === '/benchmark'
					? 'text-white bg-zinc-800'
					: 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}"
			>
				Benchmarks
			</a>
			<a
				href="/docs"
				on:click={close}
				class="flex items-center px-4 py-3 text-sm rounded-md transition-colors
				       {$page.url.pathname === '/docs'
					? 'text-white bg-zinc-800'
					: 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}"
			>
				Docs
			</a>
			<div class="h-px bg-zinc-800 my-1.5"></div>
			<a
				href="https://github.com/Vladimir-Urik/OxMgr"
				target="_blank"
				rel="noopener noreferrer"
				on:click={close}
				class="flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-400 hover:text-white
				       rounded-md hover:bg-zinc-800/50 transition-colors"
			>
				<svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				View on GitHub
			</a>
		</div>
	</div>
{/if}
