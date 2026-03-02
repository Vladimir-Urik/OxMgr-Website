<script lang="ts">
	import { page } from '$app/stores';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';

	export let version: string = '0.1.1';

	let menuOpen = false;
	let scrolled = false;

	function close() {
		menuOpen = false;
	}

	onMount(() => {
		const onScroll = () => {
			scrolled = window.scrollY > 10;
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
		return () => window.removeEventListener('scroll', onScroll);
	});

	const links = [
		{ href: '/benchmark', label: 'Benchmarks' },
		{ href: '/docs', label: 'Docs' },
	];
</script>

<nav
	class="fixed top-0 inset-x-0 z-50 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300
	       {scrolled
		? 'bg-zinc-950/95 border-b border-zinc-800/90 shadow-[0_4px_40px_rgba(0,0,0,0.5)]'
		: 'bg-zinc-950/75 border-b border-zinc-800/30'}"
>
	<!-- Top accent line -->
	<div
		class="absolute top-0 inset-x-0 h-px transition-opacity duration-300
		       bg-gradient-to-r from-transparent via-[#E8572A] to-transparent
		       {scrolled ? 'opacity-60' : 'opacity-40'}"
	></div>

	<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">

		<!-- Logo -->
		<a href="/" on:click={close} class="flex items-center gap-2.5 group shrink-0">
			<span class="font-mono font-bold text-[1.2rem] select-none" style="letter-spacing: -0.03em;">
				<span
					class="text-[#E8572A] transition-all duration-300
					       group-hover:[text-shadow:0_0_12px_rgba(232,87,42,0.6)]"
				>ox</span><span class="text-white">mgr</span>
			</span>
			<span
				class="hidden sm:inline text-[10px] font-mono text-zinc-600 border border-zinc-800/80 px-1.5 py-[3px] rounded-sm
				       group-hover:border-zinc-700 group-hover:text-zinc-500 transition-all duration-200 tabular-nums leading-none"
			>v{version}</span>
		</a>

		<!-- Desktop links -->
		<div class="hidden sm:flex items-center gap-0.5">
			{#each links as link}
				<a
					href={link.href}
					class="relative px-3.5 py-2 text-sm font-medium transition-colors duration-150
					       {$page.url.pathname === link.href
						? 'text-white'
						: 'text-zinc-500 hover:text-zinc-200'}"
				>
					{link.label}
					{#if $page.url.pathname === link.href}
						<span
							class="absolute inset-x-3.5 -bottom-px h-px rounded-full"
							style="background: #E8572A;"
						></span>
					{/if}
				</a>
			{/each}

			<div class="w-px h-4 bg-zinc-800 mx-2" aria-hidden="true"></div>

			<a
				href="https://github.com/Vladimir-Urik/OxMgr"
				target="_blank"
				rel="noopener noreferrer"
				class="group/gh flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium
				       text-zinc-400 hover:text-white
				       border border-zinc-800 hover:border-zinc-600/80 hover:bg-zinc-900/80
				       rounded transition-all duration-200"
			>
				<svg
					class="w-3.5 h-3.5 transition-transform duration-200 group-hover/gh:scale-110"
					viewBox="0 0 16 16"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
						   0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
						   -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
						   .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
						   -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
						   .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
						   .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
						   0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8
						   c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				GitHub
			</a>
		</div>

		<!-- Mobile hamburger -->
		<button
			class="sm:hidden flex flex-col justify-center items-center w-9 h-9 rounded gap-[5px]
			       hover:bg-zinc-800/50 active:bg-zinc-800/70 transition-colors"
			on:click={() => (menuOpen = !menuOpen)}
			aria-label="Toggle navigation"
			aria-expanded={menuOpen}
		>
			<span
				class="block h-px bg-zinc-300 transition-all duration-300 origin-center
				       {menuOpen ? 'w-[18px] rotate-45 translate-y-[5px]' : 'w-[18px]'}"
			></span>
			<span
				class="block h-px bg-zinc-300 transition-all duration-200
				       {menuOpen ? 'w-0 opacity-0' : 'w-[14px] self-start ml-[3px]'}"
			></span>
			<span
				class="block h-px bg-zinc-300 transition-all duration-300 origin-center
				       {menuOpen ? 'w-[18px] -rotate-45 -translate-y-[5px]' : 'w-[18px]'}"
			></span>
		</button>
	</div>
</nav>

<!-- Mobile menu -->
{#if menuOpen}
	<div
		transition:fly={{ y: -6, duration: 160, opacity: 0 }}
		class="fixed top-16 inset-x-0 z-40 sm:hidden bg-zinc-950/98 backdrop-blur-xl border-b border-zinc-800/80"
	>
		<div class="px-4 py-2 flex flex-col">
			{#each links as link}
				<a
					href={link.href}
					on:click={close}
					class="flex items-center gap-3 px-3 py-3 text-sm font-medium rounded
					       transition-colors duration-150
					       {$page.url.pathname === link.href
						? 'text-white'
						: 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}"
				>
					<span
						class="w-1 h-1 rounded-full shrink-0 transition-colors
						       {$page.url.pathname === link.href ? 'bg-[#E8572A]' : 'bg-zinc-700'}"
					></span>
					{link.label}
				</a>
			{/each}

			<div class="h-px bg-zinc-800/50 my-1.5 mx-3"></div>

			<a
				href="https://github.com/Vladimir-Urik/OxMgr"
				target="_blank"
				rel="noopener noreferrer"
				on:click={close}
				class="flex items-center gap-2.5 px-3 py-3 text-sm text-zinc-400 hover:text-white
				       rounded hover:bg-zinc-800/40 transition-colors duration-150"
			>
				<svg class="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
						   0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
						   -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
						   .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
						   -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
						   .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
						   .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
						   0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8
						   c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				View on GitHub
			</a>
		</div>
	</div>
{/if}
