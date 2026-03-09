export const prerender = true;

interface PostMeta {
	title: string;
	description: string;
	date: string;
	tags?: string[];
	author?: string;
}

interface PostModule {
	metadata: PostMeta;
}

export const load = async () => {
	const modules = import.meta.glob<PostModule>('/src/posts/*.md', { eager: true });

	const posts = Object.entries(modules).map(([path, module]) => {
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		return { slug, ...module.metadata };
	});

	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return { posts };
};
