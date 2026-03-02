<script lang="ts">
	type Tab = {
		id: string;
		label: string;
		command: string;
		hint?: string;
	};

	const tabs: Tab[] = [
		{
			id: 'npm',
			label: 'npm',
			command: 'npm install -g oxmgr'
		},
		{
			id: 'brew',
			label: 'Homebrew',
			command: 'brew tap empellio/homebrew-tap && brew install oxmgr'
		},
		{
			id: 'choco',
			label: 'Chocolatey',
			command: 'choco install oxmgr -y'
		},
		{
			id: 'apt',
			label: 'APT',
			command: `echo "deb [trusted=yes] https://vladimir-urik.github.io/OxMgr/apt stable main" \\\n  | sudo tee /etc/apt/sources.list.d/oxmgr.list\nsudo apt update && sudo apt install oxmgr`,
			hint: 'Debian / Ubuntu'
		},
		{
			id: 'source',
			label: 'Source',
			command: 'git clone https://github.com/Vladimir-Urik/OxMgr.git && cd OxMgr && cargo build --release',
			hint: 'Requires Rust toolchain'
		}
	];

	let activeTab = 'npm';
	let copiedTab = '';

	$: active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

	async function copy(tab: Tab) {
		try {
			await navigator.clipboard.writeText(tab.command);
			copiedTab = tab.id;
			setTimeout(() => (copiedTab = ''), 2000);
		} catch {
			// fallback
		}
	}
</script>

<div class="rounded border border-zinc-800 overflow-hidden">
	<!-- Tab bar — scrollable on mobile so tabs don't wrap -->
	<div class="flex bg-zinc-900 border-b border-zinc-800 overflow-x-auto no-scrollbar">
		{#each tabs as tab}
			<button
				on:click={() => (activeTab = tab.id)}
				class="px-3 sm:px-4 py-2.5 text-sm font-mono whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0
				       {activeTab === tab.id
					? 'text-white border-rust bg-zinc-950/50'
					: 'text-zinc-500 border-transparent hover:text-zinc-300'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Command block -->
	<div class="bg-[#0d0d0d]">
		<!-- Flex layout: pre takes remaining space, copy button doesn't shrink -->
		<div class="flex items-start gap-3 px-4 sm:px-5 py-4">
			<pre
				class="flex-1 min-w-0 font-mono text-sm text-zinc-200 overflow-x-auto leading-relaxed"
			><span class="text-zinc-500 select-none mr-2">$</span>{active.command}</pre>

			<button
				on:click={() => copy(active)}
				class="shrink-0 flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200
				       transition-colors border border-zinc-800 hover:border-zinc-600 rounded px-2.5 py-1.5 mt-px"
				aria-label="Copy command"
			>
				{#if copiedTab === activeTab}
					<svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<span class="text-emerald-400 hidden xs:inline">Copied</span>
				{:else}
					<svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="5" y="5" width="8" height="8" rx="1" />
						<path d="M3 11V3h8" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<span class="hidden xs:inline">Copy</span>
				{/if}
			</button>
		</div>

		{#if active.hint}
			<p class="text-xs text-zinc-500 px-4 sm:px-5 pb-3 font-mono"># {active.hint}</p>
		{/if}
	</div>
</div>

<style>
	.no-scrollbar::-webkit-scrollbar { display: none; }
	.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
