import { error } from '@sveltejs/kit';

export const prerender = true;

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

export const entries = async () => {
	const modules = import.meta.glob<PostModule>('/src/posts/*.md', { eager: true });
	return Object.keys(modules).map((path) => ({
		slug: path.split('/').pop()?.replace('.md', '') ?? ''
	}));
};

export const load = async ({ params }) => {
	const modules = import.meta.glob<PostModule>('/src/posts/*.md');
	const loader = modules[`/src/posts/${params.slug}.md`];

	if (!loader) {
		throw error(404, 'Post not found');
	}

	const post = await loader();

	return {
		content: post.default,
		metadata: post.metadata
	};
};
