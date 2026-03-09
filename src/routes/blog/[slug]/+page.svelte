<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { page } from '$app/stores';

	export let data: {
		content: ComponentType;
		metadata: {
			title: string;
			description: string;
			date: string;
			tags?: string[];
			keywords?: string[];
			author?: string;
			ogImage?: string;
		};
	};

	$: ({ content: Content, metadata } = data);

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	$: keywordsStr = metadata.keywords?.join(', ') ?? metadata.tags?.join(', ') ?? '';
	$: canonicalUrl = `https://oxmgr.empellio.com/blog/${$page.params.slug}`;
	$: ogImageUrl = metadata.ogImage ?? 'https://oxmgr.empellio.com/og-image.png';
</script>

<svelte:head>
	<title>{metadata.title} — Oxmgr</title>
	<meta name="description" content={metadata.description} />
	{#if keywordsStr}
		<meta name="keywords" content={keywordsStr} />
	{/if}
	<link rel="canonical" href={canonicalUrl} />

	<!-- Open Graph -->
	<meta property="og:title" content="{metadata.title} — Oxmgr" />
	<meta property="og:description" content={metadata.description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:type" content="article" />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:site_name" content="Oxmgr" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="{metadata.title} — Oxmgr" />
	<meta name="twitter:description" content={metadata.description} />
	<meta name="twitter:image" content={ogImageUrl} />

	<!-- Article structured data -->
	<meta property="article:published_time" content={metadata.date} />
	{#if metadata.author}
		<meta property="article:author" content={metadata.author} />
	{/if}
	{#if metadata.tags}
		{#each metadata.tags as tag}
			<meta property="article:tag" content={tag} />
		{/each}
	{/if}
</svelte:head>

<main class="min-h-screen pt-28 pb-24">
	<div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

		<!-- Back link -->
		<a
			href="/blog"
			class="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-sm
			       transition-colors duration-150 mb-10 group"
		>
			<svg
				class="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			All posts
		</a>

		<!-- Post header -->
		<header class="mb-10 pb-10 border-b border-zinc-800">
			<!-- Tags -->
			{#if metadata.tags && metadata.tags.length > 0}
				<div class="flex flex-wrap gap-1.5 mb-4">
					{#each metadata.tags as tag}
						<span class="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded-full">
							{tag}
						</span>
					{/each}
				</div>
			{/if}

			<h1 class="font-display font-bold text-3xl sm:text-4xl text-white leading-snug mb-4">
				{metadata.title}
			</h1>

			<p class="text-zinc-400 text-lg mb-5 leading-relaxed">
				{metadata.description}
			</p>

			<div class="flex items-center gap-3 text-sm text-zinc-500">
				{#if metadata.author}
					<span class="font-medium text-zinc-400">{metadata.author}</span>
					<span class="text-zinc-700">·</span>
				{/if}
				<time datetime={metadata.date} class="font-mono tabular-nums">
					{formatDate(metadata.date)}
				</time>
			</div>
		</header>

		<!-- Post content -->
		<article class="blog-prose">
			<svelte:component this={Content} />
		</article>

		<!-- Footer nav -->
		<div class="mt-16 pt-8 border-t border-zinc-800">
			<a
				href="/blog"
				class="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-200 text-sm
				       transition-colors duration-150 group"
			>
				<svg
					class="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
					fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
				Back to all posts
			</a>
		</div>

	</div>
</main>
