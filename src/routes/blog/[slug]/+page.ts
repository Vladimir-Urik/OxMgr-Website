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
	const modules = import.meta.glob<PostModule>('/src/posts/*.md');
	const loader = modules[`/src/posts/${params.slug}.md`];

	if (!loader) {
		throw error(404, 'Post not found');
	}

	const post = await loader();

	const today = new Date();
	today.setHours(23, 59, 59, 999);
	if (new Date(post.metadata.date) > today) {
		throw error(404, 'Post not found');
	}

	return {
		content: post.default,
		metadata: post.metadata
	};
};
