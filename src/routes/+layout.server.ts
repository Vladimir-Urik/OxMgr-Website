import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch }) => {
	let latestVersion = '0.1.8';

	try {
		const res = await fetch('https://api.github.com/repos/Vladimir-Urik/OxMgr/releases/latest', {
			signal: AbortSignal.timeout(5000),
			headers: { Accept: 'application/vnd.github.v3+json' }
		});
		if (res.ok) {
			const data = await res.json();
			if (data.tag_name) {
				latestVersion = data.tag_name.replace(/^v/, '');
			}
		}
	} catch {
		// use fallback
	}

	return { latestVersion };
};
