<script lang="ts">
	import Terminal from '$lib/components/Terminal.svelte';
	import BenchmarkCard from '$lib/components/BenchmarkCard.svelte';
	import InstallTabs from '$lib/components/InstallTabs.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	let oxfileTab: 'toml' | 'json' = 'toml';

	const oxfileToml = `version = 1

[defaults]
restart_policy = "on_failure"
max_restarts = 10
stop_timeout_secs = 5

[[apps]]
name = "api"
command = "node server.js"
cwd = "./services/api"
health_cmd = "curl -fsS http://127.0.0.1:3000/health"

[apps.env]
NODE_ENV = "production"
PORT = "3000"

[[apps]]
name = "worker"
command = "python worker.py"
cwd = "./services/worker"

[apps.env]
PYTHONUNBUFFERED = "1"`;

	const ecosystemJson = `{
  "apps": [
    {
      "name": "api",
      "script": "server.js",
      "cwd": "./services/api",
      "restart_policy": "on_failure",
      "max_restarts": 10,
      "stop_timeout_secs": 5,
      "health_cmd": "curl -fsS http://127.0.0.1:3000/health",
      "env": {
        "NODE_ENV": "production",
        "PORT": "3000"
      }
    },
    {
      "name": "worker",
      "script": "worker.py",
      "cwd": "./services/worker",
      "env": {
        "PYTHONUNBUFFERED": "1"
      }
    }
  ]
}`;

	const features = [
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h14M3 10h14M3 15h10" stroke-linecap="round"/></svg>`,
			title: 'Language-agnostic',
			desc: 'Run any executable — Node.js, Python, Go, Rust, shell scripts, compiled binaries. If it runs in a terminal, oxmgr can manage it.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h12v3H4zM4 9.5h12v3H4zM4 15h7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14.5" cy="15.5" r="2" /><path d="M14.5 13.5v1M14.5 17.5v-1M12.5 15.5h1M16.5 15.5h-1" stroke-linecap="round"/></svg>`,
			title: 'Declarative oxfile.toml',
			desc: 'Define all processes in a single TOML file. oxmgr apply is fully idempotent — run it in CI, on deploy, or locally without side effects.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3v3M10 14v3M3 10h3M14 10h3" stroke-linecap="round"/><circle cx="10" cy="10" r="3"/><path d="M5.1 5.1l2.1 2.1M12.8 12.8l2.1 2.1M14.9 5.1l-2.1 2.1M7.2 12.8l-2.1 2.1" stroke-linecap="round"/></svg>`,
			title: 'Health checks + auto-restart',
			desc: 'Configure a health command per process. oxmgr polls it and restarts the process automatically when it fails, with configurable backoff.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 2L2 7v6l8 5 8-5V7L10 2z" stroke-linejoin="round"/><path d="M10 2v13M2 7l8 5 8-5" stroke-linejoin="round"/></svg>`,
			title: 'Crash-loop protection',
			desc: 'Set max_restarts to halt a runaway process after N consecutive failures. Prevents a broken deploy from consuming all system resources.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
			title: 'Resource limits',
			desc: 'Cap CPU and memory per process via cgroup v2 on Linux. Keep a runaway worker from taking down your entire node.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M5.5 8L8 10.5 5.5 13M9.5 13h5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
			title: 'Built-in terminal UI',
			desc: 'Run oxmgr ui for an interactive dashboard showing all processes, their status, resource usage, and live logs in a single terminal view.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-3M7 3l6 0M7 3v14" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8l4-4M16 8V4h-4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
			title: 'PM2 compatibility',
			desc: 'Drop in an ecosystem.config.json and it works. No rewriting configs to migrate — oxmgr reads PM2 ecosystem files natively.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="10" cy="15" r="2"/><path d="M7 5h6M5 7v5.5a2.5 2.5 0 002.5 2.5h5a2.5 2.5 0 002.5-2.5V7" stroke-linecap="round"/></svg>`,
			title: 'Git + webhook deploys',
			desc: 'Trigger oxmgr apply via a webhook after a git push. Pairs cleanly with any CI/CD pipeline — no agent daemons required on the target host.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="4" height="12" rx="1"/><rect x="8" y="7" width="4" height="9" rx="1"/><rect x="13" y="2" width="4" height="14" rx="1"/></svg>`,
			title: 'Cross-platform',
			desc: 'Runs on Linux, macOS, and Windows. The same oxfile.toml works on your dev laptop and production server without modification.'
		},
		{
			icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M14.36 5.64l1.42-1.42M4.22 15.78l1.42-1.42" stroke-linecap="round"/></svg>`,
			title: 'System service integration',
			desc: 'Register oxmgr as a systemd service, launchd agent, or Windows Task Scheduler task. Auto-start on boot with a single command.'
		}
	];
</script>

<svelte:head>
	<title>Oxmgr — The process manager your infrastructure deserves</title>
	<meta name="description" content="Oxmgr is a lightweight cross-platform process manager written in Rust. 42x faster crash recovery, 20x lower memory than PM2. MIT license, open source." />
	<link rel="canonical" href="https://oxmgr.dev" />
	<meta property="og:title" content="Oxmgr — The process manager your infrastructure deserves" />
	<meta property="og:description" content="Lightweight Rust process manager. 42× faster crash recovery, 20× lower memory than PM2. npm, Homebrew, APT. MIT license." />
	<meta property="og:url" content="https://oxmgr.dev" />
	<meta property="og:type" content="website" />
	<meta name="twitter:title" content="Oxmgr — The process manager your infrastructure deserves" />
	<meta name="twitter:description" content="42× faster crash recovery, 20× lower memory than PM2. Written in Rust." />
</svelte:head>

<!-- ─── HERO ──────────────────────────────────────────────────────────── -->
<section class="relative flex items-center pt-24 pb-16 px-4 sm:px-6 overflow-hidden min-h-[calc(100svh-3.5rem)]">
	<!-- Background radial glow -->
	<div
		class="absolute inset-0 pointer-events-none"
		style="background: radial-gradient(ellipse 70% 55% at 60% 10%, rgba(232,87,42,0.10) 0%, transparent 65%);"
	></div>

	<!-- Scanline texture -->
	<div
		class="absolute inset-0 pointer-events-none opacity-30"
		style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px);"
	></div>

	<!-- Grid lines -->
	<div
		class="absolute inset-0 pointer-events-none opacity-[0.022]"
		style="background-image: linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px); background-size: 64px 64px;"
	></div>

	<div class="relative max-w-6xl w-full mx-auto">
		<div class="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">

			<!-- Left: text content -->
			<div class="text-center lg:text-left">
				<!-- Badge -->
				<div class="inline-flex items-center gap-2 border border-zinc-800 rounded-full px-3 py-1.5
				            text-[11px] font-mono text-zinc-400 mb-8 max-w-full overflow-hidden">
					<span class="w-1.5 h-1.5 rounded-full bg-rust animate-pulse shrink-0"></span>
					<span class="truncate">Written in Rust · MIT License · Cross-platform</span>
				</div>

				<!-- Headline -->
				<h1
					class="font-display font-bold text-white leading-[1.1] mb-5"
					style="font-size: clamp(1.75rem, 3.8vw, 3.25rem);"
				>
					The process manager<br class="hidden sm:block" />
					your infrastructure<br class="hidden sm:block" />
					<span class="text-rust">deserves.</span>
				</h1>

				<!-- Subheadline -->
				<p class="text-zinc-400 leading-relaxed mb-8 mx-auto lg:mx-0 max-w-lg" style="font-size: 1.05rem;">
					Lightweight, cross-platform process manager written in Rust.
					A modern alternative to PM2 — faster boot, lower memory, and crash recovery
					that's <strong class="text-zinc-300 font-semibold">42× quicker</strong>.
				</p>

				<!-- CTAs -->
				<div class="flex items-center justify-center lg:justify-start gap-3 mb-8 flex-wrap">
					<a href="#install" class="btn-primary">
						Get started
						<svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M8 3v10M3 8l5 5 5-5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</a>
					<a
						href="https://github.com/Vladimir-Urik/OxMgr"
						target="_blank"
						rel="noopener noreferrer"
						class="btn-ghost"
					>
						<svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
							<path
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
							/>
						</svg>
						View on GitHub
					</a>
				</div>

				<!-- Quick stat pills -->
				<div class="flex items-center justify-center lg:justify-start gap-2 flex-wrap max-w-full">
					<span class="stat-pill">
						<span class="text-rust font-bold font-mono">42×</span>
						<span>faster crash recovery</span>
					</span>
					<span class="stat-pill">
						<span class="text-rust font-bold font-mono">20×</span>
						<span>lower memory</span>
					</span>
					<span class="stat-pill">
						<span class="text-rust font-bold font-mono">4 ms</span>
						<span>restart time</span>
					</span>
				</div>
			</div>

			<!-- Right: Terminal -->
			<div class="w-full lg:max-w-none">
				<Terminal />
			</div>
		</div>
	</div>
</section>

<!-- ─── BENCHMARK STRIP ───────────────────────────────────────────────── -->
<section class="border-y border-zinc-800 py-10 sm:py-12 bg-zinc-900/20">
	<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
			<BenchmarkCard
				multiplier="42×"
				label="faster crash recovery"
				metric="4.0 ms vs 167.7 ms"
			/>
			<BenchmarkCard
				multiplier="20×"
				label="lower memory at scale"
				metric="7 MB vs 144 MB (100 procs)"
			/>
			<BenchmarkCard
				multiplier="3.9×"
				label="faster boot time"
				metric="100.8 ms vs 395.1 ms"
			/>
			<BenchmarkCard
				multiplier="7.4×"
				label="faster fleet start"
				metric="819 ms vs 6,037 ms (100 procs)"
			/>
		</div>
		<div class="flex items-center justify-between flex-wrap gap-2">
			<p class="text-zinc-600 text-xs font-mono">
				vs PM2 · measured on Linux · GitHub Actions Ubuntu · median of 5 runs
			</p>
			<a
				href="/benchmark"
				class="text-xs font-mono text-rust hover:text-rust-dim transition-colors flex items-center gap-1"
			>
				Full benchmark results
				<svg class="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M2 6h8M6 2l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</a>
		</div>
	</div>
</section>

<!-- ─── FEATURES ──────────────────────────────────────────────────────── -->
<section class="py-20 sm:py-24 px-4 sm:px-6">
	<div class="max-w-6xl mx-auto">
		<div class="mb-10 sm:mb-12">
			<p class="section-label">Features</p>
			<h2 class="section-title text-2xl sm:text-3xl lg:text-4xl">
				Everything a process manager should do.
			</h2>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
			{#each features as feature, i}
				<div
					class="feature-card card p-5 hover:border-zinc-700 transition-all duration-200 group relative overflow-hidden"
					style="animation-delay: {i * 40}ms"
				>
					<!-- Hover gradient -->
					<div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
						style="background: radial-gradient(ellipse 80% 60% at 10% 20%, rgba(232,87,42,0.05) 0%, transparent 70%);"
					></div>

					<!-- Feature number -->
					<span class="absolute top-4 right-4 text-[10px] font-mono text-zinc-700 group-hover:text-zinc-600 transition-colors select-none">
						{String(i + 1).padStart(2, '0')}
					</span>

					<div class="w-8 h-8 text-zinc-500 group-hover:text-rust transition-colors mb-4 relative">
						{@html feature.icon}
					</div>
					<h3 class="font-semibold text-white text-sm mb-1.5 relative">{feature.title}</h3>
					<p class="text-zinc-500 text-sm leading-relaxed relative">{feature.desc}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- ─── TUI PREVIEW ───────────────────────────────────────────────────── -->
<section class="py-20 sm:py-24 px-4 sm:px-6 border-t border-zinc-800/60">
	<div class="max-w-6xl mx-auto">
		<div class="mb-10 sm:mb-12 text-center">
			<p class="section-label justify-center">Terminal UI</p>
			<h2 class="section-title text-2xl sm:text-3xl lg:text-4xl text-center">
				Run <code class="font-mono text-rust bg-zinc-900 px-2 py-0.5 rounded text-[0.85em]">oxmgr ui</code> and see everything at once.
			</h2>
			<p class="text-zinc-400 mt-3 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
				Interactive dashboard showing all processes, status, PID, uptime, CPU, RAM, and a live
				detail sidebar — all in your terminal.
			</p>
		</div>

		<!-- Screenshot frame -->
		<div class="relative mx-auto max-w-5xl">
			<!-- Glow behind the frame -->
			<div
				class="absolute -inset-px rounded-xl pointer-events-none"
				style="background: linear-gradient(135deg, rgba(232,87,42,0.18) 0%, transparent 50%, rgba(232,87,42,0.08) 100%); filter: blur(1px);"
			></div>

			<!-- Window chrome -->
			<div class="relative rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900 shadow-2xl">
				<!-- Titlebar -->
				<div class="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
					<span class="w-3 h-3 rounded-full bg-zinc-700"></span>
					<span class="w-3 h-3 rounded-full bg-zinc-700"></span>
					<span class="w-3 h-3 rounded-full bg-zinc-700"></span>
					<span class="ml-3 text-xs font-mono text-zinc-500 select-none">oxmgr ui</span>
				</div>

				<!-- Screenshot -->
				<img
					src="/tui-preview.png"
					alt="oxmgr terminal UI showing process list and sidebar with CPU, RAM and status info"
					class="w-full block"
					loading="lazy"
					decoding="async"
				/>
			</div>

			<!-- Subtle bottom fade -->
			<div
				class="absolute inset-x-0 bottom-0 h-16 pointer-events-none rounded-b-xl"
				style="background: linear-gradient(to top, rgba(9,9,11,0.4), transparent);"
			></div>
		</div>
	</div>
</section>

<!-- ─── INSTALL ───────────────────────────────────────────────────────── -->
<section id="install" class="py-20 sm:py-24 px-4 sm:px-6 border-t border-zinc-800/60">
	<div class="max-w-6xl mx-auto">
		<div class="grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16 items-start">
			<!-- Left: description -->
			<div>
				<p class="section-label">Install</p>
				<h2 class="section-title text-2xl sm:text-3xl lg:text-4xl mb-3">
					Get oxmgr running<br class="hidden lg:block" /> in seconds.
				</h2>
				<p class="text-zinc-400 mb-6 leading-relaxed">
					Pick your package manager. All channels track the same releases and binaries are
					pre-built for Linux, macOS, and Windows.
				</p>
				<div class="flex flex-col gap-2.5 text-sm text-zinc-500">
					<div class="flex items-start gap-2.5">
						<svg class="w-4 h-4 text-rust shrink-0 mt-px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>No Rust toolchain required for prebuilt binaries</span>
					</div>
					<div class="flex items-start gap-2.5">
						<svg class="w-4 h-4 text-rust shrink-0 mt-px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>Auto-updates via your package manager</span>
					</div>
					<div class="flex items-start gap-2.5">
						<svg class="w-4 h-4 text-rust shrink-0 mt-px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>Single static binary, no runtime dependencies</span>
					</div>
				</div>
				<p class="text-xs text-zinc-600 font-mono mt-6">
					Having trouble? See the
					<a href="https://github.com/Vladimir-Urik/OxMgr#installation" target="_blank" rel="noopener noreferrer"
						class="text-zinc-500 hover:text-white transition-colors underline underline-offset-2">
						install guide on GitHub
					</a>.
				</p>
			</div>

			<!-- Right: install tabs -->
			<div class="lg:pt-9 min-w-0">
				<InstallTabs />
			</div>
		</div>
	</div>
</section>

<!-- ─── OXFILE PREVIEW ────────────────────────────────────────────────── -->
<section class="py-20 sm:py-24 px-4 sm:px-6 border-t border-zinc-800/60">
	<div class="max-w-6xl mx-auto">
		<div class="grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16 items-start">
			<!-- Left: description -->
			<div>
				<p class="section-label">Configuration</p>
				<h2 class="section-title text-2xl sm:text-3xl lg:text-4xl mb-3">
					One file.<br class="hidden lg:block" /> All your processes.
				</h2>
				<p class="text-zinc-400 mb-6 leading-relaxed">
					A declarative <code class="code-inline">oxfile.toml</code> defines everything. Or keep your existing
					PM2 <code class="code-inline">ecosystem.config.json</code> — it works out of the box.
				</p>
				<div class="flex flex-col gap-2.5 text-sm text-zinc-500 mb-8">
					<div class="flex items-start gap-2.5">
						<svg class="w-4 h-4 text-rust shrink-0 mt-px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>Idempotent — safe to run in CI or on every deploy</span>
					</div>
					<div class="flex items-start gap-2.5">
						<svg class="w-4 h-4 text-rust shrink-0 mt-px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>Per-process env vars, health checks, restart policies</span>
					</div>
					<div class="flex items-start gap-2.5">
						<svg class="w-4 h-4 text-rust shrink-0 mt-px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M2 8l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>PM2 ecosystem.config.json compatible, zero migration</span>
					</div>
				</div>
				<div class="flex gap-5 text-sm">
					<a href="/docs" class="text-rust hover:text-rust-dim transition-colors font-medium">
						Read the docs →
					</a>
					<a
						href="https://github.com/Vladimir-Urik/OxMgr#configuration"
						target="_blank"
						rel="noopener noreferrer"
						class="text-zinc-500 hover:text-white transition-colors"
					>
						Full config reference ↗
					</a>
				</div>
			</div>

			<!-- Right: code block with tabs -->
			<div>
				<!-- Tab switcher -->
				<div class="flex border-b border-zinc-800 mb-0">
					<button
						on:click={() => (oxfileTab = 'toml')}
						class="px-4 py-2.5 text-sm font-mono border-b-2 -mb-px transition-colors
						       {oxfileTab === 'toml'
							? 'text-white border-rust'
							: 'text-zinc-500 border-transparent hover:text-zinc-300'}"
					>
						oxfile.toml
					</button>
					<button
						on:click={() => (oxfileTab = 'json')}
						class="px-4 py-2.5 text-sm font-mono border-b-2 -mb-px transition-colors
						       {oxfileTab === 'json'
							? 'text-white border-rust'
							: 'text-zinc-500 border-transparent hover:text-zinc-300'}"
					>
						ecosystem.config.json
					</button>
					<div class="flex-1"></div>
					<span class="self-center text-xs font-mono text-zinc-600 pr-2 hidden sm:inline">equivalent configs</span>
				</div>

				{#if oxfileTab === 'toml'}
					<CodeBlock code={oxfileToml} language="toml" filename="oxfile.toml" />
				{:else}
					<CodeBlock code={ecosystemJson} language="json" filename="ecosystem.config.json" />
				{/if}
			</div>
		</div>
	</div>
</section>

<!-- ─── CTA BANNER ────────────────────────────────────────────────────── -->
<section class="py-20 sm:py-24 px-4 sm:px-6 border-t border-zinc-800/60 relative overflow-hidden">
	<!-- Background effect -->
	<div
		class="absolute inset-0 pointer-events-none"
		style="background: radial-gradient(ellipse 60% 70% at 50% 100%, rgba(232,87,42,0.07) 0%, transparent 65%);"
	></div>
	<div
		class="absolute inset-x-0 bottom-0 h-px pointer-events-none"
		style="background: linear-gradient(90deg, transparent, rgba(232,87,42,0.3) 50%, transparent);"
	></div>

	<div class="max-w-3xl mx-auto text-center relative">
		<p class="section-label justify-center">Open source</p>
		<h2
			class="font-display font-bold text-white mb-4"
			style="font-size: clamp(1.75rem, 4vw, 2.75rem); line-height: 1.1;"
		>
			Your infrastructure is waiting.
		</h2>
		<p class="text-zinc-400 mb-8 text-base sm:text-lg max-w-md mx-auto">
			MIT licensed, open source, no telemetry, no surprises. Just a fast process manager that stays out of your way.
		</p>
		<div class="flex items-center justify-center gap-3 flex-wrap">
			<a href="#install" class="btn-primary">
				Get started
				<svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M8 3v10M3 8l5 5 5-5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</a>
			<a
				href="https://github.com/Vladimir-Urik/OxMgr"
				target="_blank"
				rel="noopener noreferrer"
				class="btn-ghost"
			>
				Star on GitHub ↗
			</a>
		</div>
	</div>
</section>
