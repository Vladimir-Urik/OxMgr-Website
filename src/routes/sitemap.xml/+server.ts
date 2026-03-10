import type { RequestHandler } from './$types';

const SITE_URL = 'https://oxmgr.empellio.com';

interface PostModule {
	metadata: {
		date?: string;
	};
}

export const GET: RequestHandler = async () => {
	const modules = import.meta.glob<PostModule>('/src/posts/*.md', { eager: true });

	const today = new Date();
	today.setHours(23, 59, 59, 999);

	const posts = Object.entries(modules)
		.map(([path, module]) => ({
			slug: path.split('/').pop()?.replace('.md', '') ?? '',
			date: module.metadata?.date ?? ''
		}))
		.filter((post) => !post.date || new Date(post.date) <= today);

	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	const staticPages = [
		{ url: '/', priority: '1.0', changefreq: 'weekly' },
		{ url: '/blog', priority: '0.9', changefreq: 'daily' },
		{ url: '/docs', priority: '0.9', changefreq: 'weekly' },
		{ url: '/docs/installation', priority: '0.8', changefreq: 'weekly' },
		{ url: '/docs/cli-reference', priority: '0.8', changefreq: 'weekly' },
		{ url: '/docs/configuration', priority: '0.8', changefreq: 'weekly' },
		{ url: '/docs/health-checks', priority: '0.8', changefreq: 'weekly' },
		{ url: '/docs/resource-limits', priority: '0.7', changefreq: 'weekly' },
		{ url: '/docs/system-services', priority: '0.7', changefreq: 'weekly' },
		{ url: '/docs/git-webhooks', priority: '0.8', changefreq: 'weekly' },
		{ url: '/docs/pm2-migration', priority: '0.8', changefreq: 'weekly' },
		{ url: '/docs/environment-variables', priority: '0.7', changefreq: 'weekly' },
		{ url: '/benchmark', priority: '0.7', changefreq: 'monthly' }
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${staticPages
	.map(
		(page) => `  <url>
    <loc>${SITE_URL}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
	)
	.join('\n')}
${posts
	.map(
		(post) => `  <url>
    <loc>${SITE_URL}/blog/${post.slug}</loc>${post.date ? `\n    <lastmod>${post.date}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
