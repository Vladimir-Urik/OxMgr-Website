import type { PageServerLoad } from './$types';

export const prerender = false;

type BenchmarkRow = {
	metric: string;
	oxmgr: string;
	pm2: string;
	ratio: string;
	highlight: boolean;
};

const FALLBACK_ROWS: BenchmarkRow[] = [
	{ metric: 'Boot time',              oxmgr: '100.8 ms',   pm2: '395.1 ms',     ratio: '3.92× faster',  highlight: true  },
	{ metric: 'Daemon RSS (idle)',       oxmgr: '5,828 KB',   pm2: '56,956 KB',    ratio: '9.77× lower',   highlight: true  },
	{ metric: 'Daemon RSS (100 procs)', oxmgr: '7,012 KB',   pm2: '144,380 KB',   ratio: '20.59× lower',  highlight: true  },
	{ metric: 'Start 1 process',        oxmgr: '3.9 ms',     pm2: '184.0 ms',     ratio: '47.7× faster',  highlight: true  },
	{ metric: 'Start 100 processes',    oxmgr: '818.8 ms',   pm2: '6,037.4 ms',   ratio: '7.37× faster',  highlight: true  },
	{ metric: 'Restart → TCP ready',    oxmgr: '238.8 ms',   pm2: '394.1 ms',     ratio: '1.65× faster',  highlight: false },
	{ metric: 'Crash → PID visible',    oxmgr: '4.0 ms',     pm2: '167.7 ms',     ratio: '42.46× faster', highlight: true  },
	{ metric: 'Crash → TCP ready',      oxmgr: '36.6 ms',    pm2: '169.0 ms',     ratio: '4.62× faster',  highlight: true  }
];

function fmtMs(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
	if (ms >= 100)  return `${ms.toFixed(1)} ms`;
	if (ms >= 10)   return `${ms.toFixed(1)} ms`;
	return `${ms.toFixed(1)} ms`;
}

function fmtKb(kb: number): string {
	return `${Math.round(kb).toLocaleString('en-US')} KB`;
}

function ratio(pm2Val: number, oxVal: number, label: string, threshold = 2.5): BenchmarkRow['ratio'] {
	const r = pm2Val / oxVal;
	return `${r.toFixed(2)}× ${label}`;
}

function highlight(pm2Val: number, oxVal: number, threshold = 2.5): boolean {
	return pm2Val / oxVal >= threshold;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(json: any): { rows: BenchmarkRow[]; generatedAt: string } {
	const rows: BenchmarkRow[] = [];
	const generatedAt: string = json?.metadata?.generated_at_utc ?? '';

	const boot = json?.empty_daemon_boot;
	if (boot) {
		const ox = boot.oxmgr?.boot_ms?.median;
		const pm = boot.pm2?.boot_ms?.median;
		if (ox && pm) rows.push({
			metric: 'Boot time', oxmgr: fmtMs(ox), pm2: fmtMs(pm),
			ratio: ratio(pm, ox, 'faster'), highlight: highlight(pm, ox)
		});

		const oxRss = boot.oxmgr?.daemon_rss_kb?.median;
		const pmRss = boot.pm2?.daemon_rss_kb?.median;
		if (oxRss && pmRss) rows.push({
			metric: 'Daemon RSS (idle)', oxmgr: fmtKb(oxRss), pm2: fmtKb(pmRss),
			ratio: ratio(pmRss, oxRss, 'lower'), highlight: highlight(pmRss, oxRss)
		});
	}

	const scale = json?.scale;
	if (scale) {
		// RSS at 100 procs
		const rss100ox = scale['100']?.oxmgr?.daemon_rss_kb?.median;
		const rss100pm = scale['100']?.pm2?.daemon_rss_kb?.median;
		if (rss100ox && rss100pm) rows.push({
			metric: 'Daemon RSS (100 procs)', oxmgr: fmtKb(rss100ox), pm2: fmtKb(rss100pm),
			ratio: ratio(rss100pm, rss100ox, 'lower'), highlight: highlight(rss100pm, rss100ox)
		});

		// Start 1 process
		const s1ox = scale['1']?.oxmgr?.start_ms?.median;
		const s1pm = scale['1']?.pm2?.start_ms?.median;
		if (s1ox && s1pm) rows.push({
			metric: 'Start 1 process', oxmgr: fmtMs(s1ox), pm2: fmtMs(s1pm),
			ratio: ratio(s1pm, s1ox, 'faster'), highlight: highlight(s1pm, s1ox)
		});

		// Start 100 processes
		const s100ox = scale['100']?.oxmgr?.start_ms?.median;
		const s100pm = scale['100']?.pm2?.start_ms?.median;
		if (s100ox && s100pm) rows.push({
			metric: 'Start 100 processes', oxmgr: fmtMs(s100ox), pm2: fmtMs(s100pm),
			ratio: ratio(s100pm, s100ox, 'faster'), highlight: highlight(s100pm, s100ox)
		});
	}

	const lc = json?.single_app_lifecycle;
	if (lc) {
		// Restart → TCP ready
		const rtox = lc?.restart_tcp_ready_ms?.oxmgr?.median;
		const rtpm = lc?.restart_tcp_ready_ms?.pm2?.median;
		if (rtox && rtpm) rows.push({
			metric: 'Restart → TCP ready', oxmgr: fmtMs(rtox), pm2: fmtMs(rtpm),
			ratio: ratio(rtpm, rtox, 'faster'), highlight: highlight(rtpm, rtox)
		});

		// Crash → PID visible
		const cpox = lc?.crash_pid_visible_ms?.oxmgr?.median;
		const cppm = lc?.crash_pid_visible_ms?.pm2?.median;
		if (cpox && cppm) rows.push({
			metric: 'Crash → PID visible', oxmgr: fmtMs(cpox), pm2: fmtMs(cppm),
			ratio: ratio(cppm, cpox, 'faster'), highlight: highlight(cppm, cpox)
		});

		// Crash → TCP ready
		const ctox = lc?.crash_tcp_ready_ms?.oxmgr?.median;
		const ctpm = lc?.crash_tcp_ready_ms?.pm2?.median;
		if (ctox && ctpm) rows.push({
			metric: 'Crash → TCP ready', oxmgr: fmtMs(ctox), pm2: fmtMs(ctpm),
			ratio: ratio(ctpm, ctox, 'faster'), highlight: highlight(ctpm, ctox)
		});
	}

	return { rows, generatedAt };
}

export const load: PageServerLoad = async ({ fetch }) => {
	let rows = FALLBACK_ROWS;
	let fromGitHub = false;
	let generatedAt = '';
	let latestVersion = '0.1.1';

	const [benchResult, releaseResult] = await Promise.allSettled([
		fetch('https://raw.githubusercontent.com/Vladimir-Urik/OxMgr/refs/heads/master/benchmark.json', {
			signal: AbortSignal.timeout(8000)
		}),
		fetch('https://api.github.com/repos/Vladimir-Urik/OxMgr/releases/latest', {
			signal: AbortSignal.timeout(6000),
			headers: { Accept: 'application/vnd.github.v3+json' }
		})
	]);

	// Parse benchmark.json
	if (benchResult.status === 'fulfilled' && benchResult.value.ok) {
		try {
			const json = await benchResult.value.json();
			const { rows: parsed, generatedAt: genAt } = parseJson(json);
			if (parsed.length > 0) {
				rows = parsed;
				fromGitHub = true;
			}
			if (genAt) generatedAt = genAt;
		} catch {
			// use fallback
		}
	}

	// Latest release version
	if (releaseResult.status === 'fulfilled' && releaseResult.value.ok) {
		try {
			const release = await releaseResult.value.json();
			if (release.tag_name) {
				latestVersion = release.tag_name.replace(/^v/, '');
			}
		} catch {
			// use fallback
		}
	}

	return { rows, fromGitHub, generatedAt, latestVersion };
};
