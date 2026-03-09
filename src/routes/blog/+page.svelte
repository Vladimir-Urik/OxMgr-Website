<script lang="ts">
	export let data: {
		posts: {
			slug: string;
			title: string;
			description: string;
			date: string;
			tags?: string[];
			author?: string;
		}[];
	};

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Blog — Oxmgr</title>
	<meta name="description" content="Articles, benchmarks, and updates from the Oxmgr team. Learn about process management, Rust performance, and DevOps best practices." />
	<link rel="canonical" href="https://oxmgr.empellio.com/blog" />
	<meta property="og:title" content="Blog — Oxmgr" />
	<meta property="og:description" content="Articles, benchmarks, and updates from the Oxmgr team." />
	<meta property="og:url" content="https://oxmgr.empellio.com/blog" />
	<meta property="og:type" content="website" />
</svelte:head>

<main class="min-h-screen pt-28 pb-24">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

		<!-- Header -->
		<div class="mb-14">
			<p class="section-label">
				<span class="inline-block w-5 h-px bg-rust"></span>
				Writing
			</p>
			<h1 class="section-title text-4xl sm:text-5xl mb-4">Blog</h1>
			<p class="text-zinc-400 text-lg max-w-xl">
				Updates, benchmarks, and deep dives from the Oxmgr team.
			</p>
		</div>

		<!-- Posts -->
		{#if data.posts.length === 0}
			<p class="text-zinc-500 text-sm">No posts yet. Check back soon.</p>
		{:else}
			<div class="flex flex-col gap-4">
				{#each data.posts as post, i}
					<a
						href="/blog/{post.slug}"
						class="group card p-6 hover:border-zinc-700 transition-all duration-200
						       hover:shadow-[0_0_40px_rgba(0,0,0,0.4)] hover:-translate-y-px"
						style="animation: revealUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) {i * 60}ms both;"
					>
						<div class="flex flex-col sm:flex-row sm:items-start gap-4">
							<div class="flex-1 min-w-0">
								<!-- Date + tags row -->
								<div class="flex flex-wrap items-center gap-2 mb-3">
									<time
										datetime={post.date}
										class="text-xs font-mono text-zinc-500 tabular-nums"
									>
										{formatDate(post.date)}
									</time>
									{#if post.tags && post.tags.length > 0}
										<span class="text-zinc-700 text-xs">·</span>
										{#each post.tags.slice(0, 3) as tag}
											<span class="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded-full">
												{tag}
											</span>
										{/each}
									{/if}
								</div>

								<!-- Title -->
								<h2 class="font-display font-bold text-xl text-white mb-2
								           group-hover:text-rust transition-colors duration-200 leading-snug">
									{post.title}
								</h2>

								<!-- Description -->
								<p class="text-zinc-400 text-sm leading-relaxed line-clamp-2">
									{post.description}
								</p>
							</div>

							<!-- Arrow -->
							<div class="shrink-0 self-center sm:self-start sm:mt-1">
								<svg
									class="w-4 h-4 text-zinc-600 group-hover:text-rust group-hover:translate-x-0.5
									       transition-all duration-200"
									fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
								</svg>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}

	</div>
</main>
