<script lang="ts">
	export let multiplier: string;
	export let label: string;
	export let metric: string = '';
</script>

<div
	class="relative bg-zinc-900 border border-zinc-800 rounded p-5 sm:p-6 overflow-hidden
	       hover:border-zinc-700 transition-all duration-200 group"
>
	<!-- Accent bar -->
	<div
		class="absolute left-0 top-0 bottom-0 w-[3px] bg-rust opacity-60 group-hover:opacity-100 transition-opacity"
	></div>

	<!-- Glow -->
	<div
		class="absolute -top-8 -right-8 w-24 h-24 bg-rust opacity-[0.04] rounded-full blur-2xl
		       group-hover:opacity-[0.10] transition-opacity pointer-events-none"
	></div>

	<div class="pl-2">
		<div
			class="font-display font-bold text-rust leading-none mb-2 benchmark-number"
			style="font-size: clamp(2.25rem, 5vw, 3.25rem);"
		>
			{multiplier}
		</div>
		<div class="text-zinc-100 font-medium text-xs sm:text-sm leading-snug">{label}</div>
		{#if metric}
			<div class="text-zinc-500 text-[11px] sm:text-xs mt-1 font-mono">{metric}</div>
		{/if}
	</div>
</div>

<style>
	.benchmark-number {
		animation: countIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes countIn {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
