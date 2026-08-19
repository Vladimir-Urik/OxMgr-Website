<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export let code: string;
	export let language: string = 'bash';
	export let filename: string = '';

	let highlighted = '';
	let copied = false;

	// Normalize toml → ini (similar syntax, hljs has ini but not toml)
	$: lang = language === 'toml' ? 'ini' : language;

	onMount(async () => {
		if (!browser) return;
		try {
			const [{ default: hljs }, { default: bash }, { default: json }, { default: ini }] =
				await Promise.all([
					import('highlight.js/lib/core'),
					import('highlight.js/lib/languages/bash'),
					import('highlight.js/lib/languages/json'),
					import('highlight.js/lib/languages/ini')
				]);

			if (!hljs.getLanguage('bash')) hljs.registerLanguage('bash', bash);
			if (!hljs.getLanguage('json')) hljs.registerLanguage('json', json);
			if (!hljs.getLanguage('ini')) hljs.registerLanguage('ini', ini);

			const useLang = hljs.getLanguage(lang) ? lang : 'plaintext';
			highlighted = hljs.highlight(code, { language: useLang }).value;
		} catch {
			// fallback: plain text
			highlighted = '';
		}
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// silent
		}
	}

	function escape(str: string) {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}
</script>

<div class="rounded border border-zinc-800 overflow-hidden">
	{#if filename}
		<div class="flex items-center justify-between bg-zinc-900 px-4 py-2.5 border-b border-zinc-800">
			<span class="text-xs font-mono text-zinc-400">{filename}</span>
			<button
				on:click={copy}
				class="text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors
				       flex items-center gap-1.5 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-1"
				aria-label="Copy code"
			>
				{#if copied}
					<svg class="w-3 h-3 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<span class="text-emerald-400">Copied</span>
				{:else}
					<svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="5" y="5" width="8" height="8" rx="1" />
						<path d="M3 11V3h8" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					Copy
				{/if}
			</button>
		</div>
	{/if}

	<div class="relative bg-[#0d0d0d] group">
		{#if !filename}
			<button
				on:click={copy}
				class="absolute right-3 top-3 z-10 opacity-0 group-hover:opacity-100
				       text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-all
				       flex items-center gap-1.5 border border-zinc-800 hover:border-zinc-600
				       rounded px-2 py-1 bg-zinc-900"
				aria-label="Copy code"
			>
				{#if copied}
					<svg class="w-3 h-3 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<span class="text-emerald-400">Copied</span>
				{:else}
					<svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="5" y="5" width="8" height="8" rx="1" />
						<path d="M3 11V3h8" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					Copy
				{/if}
			</button>
		{/if}

		<pre
			class="overflow-hidden p-5 text-sm font-mono leading-relaxed text-zinc-300 whitespace-pre-wrap break-words"
		><code>{#if highlighted}{@html highlighted}{:else}{escape(code)}{/if}</code></pre>
	</div>
</div>
