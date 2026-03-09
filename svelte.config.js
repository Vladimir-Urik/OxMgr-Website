import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md'],
	preprocess: [
		vitePreprocess(),
		mdsvex({
			extensions: ['.md'],
			smartypants: true
		})
	],
	kit: {
		adapter: adapter(),
		prerender: {
			handleHttpError: ({ path, referrer, message }) => {
				// Ignore missing assets (og-image, etc.) — not critical for prerender
				if (path.startsWith('/og-') || path.endsWith('.png') || path.endsWith('.jpg')) {
					return;
				}
				throw new Error(message);
			}
		}
	}
};

export default config;
