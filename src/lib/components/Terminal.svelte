<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';

	const TYPING_SPEED      = 38;
	const TYPING_JITTER     = 18;
	const OUTPUT_LINE_DELAY = 100;
	const PAUSE_AFTER_SCENE = 1800;

	type OutputLine = { text: string; style: 'dim' | 'green' | 'orange' | 'header' | 'plain' };
	type Line = { text: string; style: OutputLine['style'] | 'command' };

	const scenes: Array<{ command: string; output: OutputLine[] }> = [
		{
			command: 'oxmgr apply ./oxfile.toml',
			output: [
				{ text: 'Applying configuration...', style: 'dim' },
				{ text: '  ✓  api       started   pid:14220   103ms', style: 'green' },
				{ text: '  ✓  worker    started   pid:14221    98ms', style: 'green' },
				{ text: '  ✓  redis     started   pid:9834     54ms', style: 'green' },
				{ text: '', style: 'plain' },
				{ text: 'Applied 3 processes.', style: 'orange' }
			]
		},
		{
			command: 'oxmgr list',
			output: [
				{ text: '  NAME      STATUS     PID      UPTIME    RSS  ', style: 'header' },
				{ text: '  ─────────────────────────────────────────────', style: 'dim' },
				{ text: '  api       ● running   14220    3h 27m   12 MB', style: 'green' },
				{ text: '  worker    ● running   14221    3h 27m    8 MB', style: 'green' },
				{ text: '  redis     ● running    9834    1d 2h     6 MB', style: 'green' }
			]
		},
		{
			command: 'oxmgr ui',
			output: []
		}
	];

	let phase: 'terminal' | 'ui' = 'terminal';
	let displayLines: Line[] = [];
	let currentTyping = '';
	let cursorVisible = true;
	let terminalEl: HTMLElement;
	let timeouts: ReturnType<typeof setTimeout>[] = [];
	let blinkInterval: ReturnType<typeof setInterval>;
	let uiClockInterval: ReturnType<typeof setInterval>;

	function addTimeout(fn: () => void, delay: number) {
		const t = setTimeout(fn, delay);
		timeouts.push(t);
		return t;
	}

	function scroll() {
		if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
	}

	function typeCommand(cmd: string, onDone: () => void) {
		let i = 0;
		currentTyping = '';
		function next() {
			if (i < cmd.length) {
				currentTyping += cmd[i++];
				scroll();
				addTimeout(next, TYPING_SPEED + Math.random() * TYPING_JITTER);
			} else {
				addTimeout(onDone, 220);
			}
		}
		next();
	}

	function showOutput(lines: OutputLine[], onDone: () => void) {
		displayLines = [...displayLines, { text: currentTyping, style: 'command' }];
		currentTyping = '';
		let i = 0;
		function next() {
			if (i < lines.length) {
				displayLines = [...displayLines, { text: lines[i].text, style: lines[i].style }];
				i++;
				scroll();
				addTimeout(next, OUTPUT_LINE_DELAY);
			} else {
				addTimeout(onDone, PAUSE_AFTER_SCENE);
			}
		}
		next();
	}

	function enterUiMode() {
		phase = 'ui';

		// Exit UI mode after ~5s
		uiClockInterval = setTimeout(() => {
			phase = 'terminal';
			displayLines = [];
			addTimeout(() => runScene(0), 400);
		}, 5000);
	}

	function runScene(idx: number) {
		const scene = scenes[idx];
		const isUi = scene.command === 'oxmgr ui';

		typeCommand(scene.command, () => {
			if (isUi) {
				displayLines = [...displayLines, { text: currentTyping, style: 'command' }];
				currentTyping = '';
				addTimeout(() => {
					displayLines = [];
					enterUiMode();
				}, 350);
			} else {
				showOutput(scene.output, () => {
					displayLines = [...displayLines, { text: '', style: 'plain' }];
					runScene((idx + 1) % scenes.length);
				});
			}
		});
	}

	onMount(() => {
		blinkInterval = setInterval(() => { cursorVisible = !cursorVisible; }, 530);
		addTimeout(() => runScene(0), 600);
	});

	onDestroy(() => {
		timeouts.forEach(clearTimeout);
		clearInterval(blinkInterval);
		clearInterval(uiClockInterval);
	});
</script>

<div class="terminal-window rounded border border-zinc-800 overflow-hidden shadow-2xl shadow-black/60">
	<!-- Title bar -->
	<div class="flex items-center gap-3 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
		<div class="flex gap-1.5">
			<span class="w-3 h-3 rounded-full bg-[#ff5f57]"></span>
			<span class="w-3 h-3 rounded-full bg-[#febc2e]"></span>
			<span class="w-3 h-3 rounded-full bg-[#28c840]"></span>
		</div>
		<span class="flex-1 text-center text-xs text-zinc-500 select-none" style="font-family: 'JetBrains Mono', monospace;">
   {phase === 'ui' ? 'oxmgr ui' : 'zsh — ~/projects/myapp'}
  </span>
	</div>

	<!-- Body -->
	<div class="relative bg-[#0d0d0d] h-[310px] overflow-hidden">

		<!-- ── TERMINAL PHASE ─────────────────────────────────────────── -->
		{#if phase === 'terminal'}
			<div
					bind:this={terminalEl}
					transition:fade={{ duration: 180 }}
					class="terminal-scroll h-full overflow-y-auto px-4 py-4 text-sm leading-relaxed"
					style="font-family: 'JetBrains Mono', monospace;"
			>
				{#each displayLines as line}
					{#if line.style === 'command'}
						<div class="flex">
							<span class="text-rust mr-2 select-none">$</span>
							<span class="text-zinc-100">{line.text}</span>
						</div>
					{:else if line.style === 'green'}
						<div class="text-emerald-400">{line.text}</div>
					{:else if line.style === 'orange'}
						<div class="text-rust font-medium">{line.text}</div>
					{:else if line.style === 'header'}
						<div class="text-zinc-400 font-medium">{line.text}</div>
					{:else if line.style === 'dim'}
						<div class="text-zinc-500">{line.text}</div>
					{:else}
						<div class="h-3">&nbsp;</div>
					{/if}
				{/each}

				<!-- Active typing line -->
				<div class="flex">
					<span class="text-rust mr-2 select-none">$</span>
					<span class="text-zinc-100">{currentTyping}</span>
					<span
							class="inline-block w-[2px] h-[1.1em] bg-zinc-300 ml-px translate-y-[1px] transition-opacity duration-75"
							style="opacity: {cursorVisible ? 1 : 0}"
					></span>
				</div>
			</div>
		{/if}

		<!-- ── TUI PHASE ──────────────────────────────────────────────── -->
		{#if phase === 'ui'}
			<div
					transition:fade={{ duration: 200 }}
					class="h-full w-full"
			>
				<img
						src="/tui-preview.png"
						alt="oxmgr ui preview"
						class="h-full w-full object-cover"
				/>
			</div>
		{/if}

	</div>
</div>
