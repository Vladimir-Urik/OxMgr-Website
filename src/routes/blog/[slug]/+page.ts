import { error } from '@sveltejs/kit';

interface PostModule {
	default: unknown;
	metadata: {
		title: string;
		description: string;
		date: string;
		tags?: string[];
		keywords?: string[];
		author?: string;
		ogImage?: string;
	};
}

export const load = async ({ params }) => {
	const modules = import.meta.glob<PostModule>('/src/posts/*.md', { eager: true });
	const post = modules[`/src/posts/${params.slug}.md`];

	if (!post) {
		throw error(404, 'Post not found');
	}

	const today = new Date();
	today.setHours(23, 59, 59, 999);
	if (new Date(post.metadata.date) > today) {
		throw error(404, 'Post not found');
	}

	// Return only serializable metadata — never pass a Svelte component through data
	// (components can't survive SSR→client serialization, causing blank pages on direct load)
	return {
		metadata: post.metadata
	};
};
