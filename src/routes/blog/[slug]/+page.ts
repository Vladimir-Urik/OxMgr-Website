import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	try {
		const post = await import(`../../../posts/${params.slug}.md`);

		const today = new Date();
		today.setHours(23, 59, 59, 999);
		if (new Date(post.metadata.date) > today) {
			throw error(404, 'Post not found');
		}

		return {
			Content: post.default,
			metadata: post.metadata
		};
	} catch (e: any) {
		if (e?.status === 404) {
			throw e;
		}
		throw error(404, 'Post not found');
	}
};
