<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const aptSigned = `sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://vladimir-urik.github.io/OxMgr/apt/keyrings/oxmgr-archive-keyring.gpg \\
  | sudo tee /etc/apt/keyrings/oxmgr-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/oxmgr-archive-keyring.gpg] https://vladimir-urik.github.io/OxMgr/apt stable main" \\
  | sudo tee /etc/apt/sources.list.d/oxmgr.list
sudo apt update && sudo apt install oxmgr`;
</script>

<svelte:head>
	<title>Installation — Oxmgr Docs</title>
	<meta name="description" content="Install Oxmgr on Linux, macOS, or Windows. Available via npm, Homebrew, APT, Chocolatey, Scoop, AUR, and from source." />
	<link rel="canonical" href="https://oxmgr.empellio.com/docs/installation" />
	<meta property="og:title" content="Installing Oxmgr" />
	<meta property="og:description" content="Install Oxmgr on Linux, macOS, or Windows via npm, Homebrew, APT, Chocolatey, Scoop, AUR, or build from source." />
	<meta property="og:url" content="https://oxmgr.empellio.com/docs/installation" />
</svelte:head>

<div class="mb-10 sm:mb-12">
	<p class="section-label">Documentation</p>
	<h1 class="section-title text-3xl sm:text-4xl lg:text-5xl mb-4">Installation</h1>
	<p class="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl">
		Oxmgr supports Linux, macOS, and Windows. Pick the install method that fits your workflow.
	</p>
</div>

<div class="space-y-8">

	<div>
		<h2 class="doc-subheading">npm / yarn</h2>
		<CodeBlock code={`npm install -g oxmgr\n# or\nyarn global add oxmgr`} language="bash" />
		<p class="doc-text mt-2">Works on all platforms where Node.js is installed. Fastest way to get started.</p>
	</div>

	<div>
		<h2 class="doc-subheading">Homebrew <span class="text-zinc-600 font-normal text-sm">macOS / Linux</span></h2>
		<CodeBlock code={`brew tap empellio/homebrew-tap\nbrew install oxmgr`} language="bash" />
	</div>

	<div>
		<h2 class="doc-subheading">Chocolatey <span class="text-zinc-600 font-normal text-sm">Windows</span></h2>
		<CodeBlock code="choco install oxmgr -y" language="bash" />
	</div>

	<div>
		<h2 class="doc-subheading">Scoop <span class="text-zinc-600 font-normal text-sm">Windows</span></h2>
		<CodeBlock code={`scoop bucket add oxmgr https://github.com/empellio/scoop-bucket\nscoop install oxmgr/oxmgr`} language="bash" />
	</div>

	<div>
		<h2 class="doc-subheading">AUR <span class="text-zinc-600 font-normal text-sm">Arch Linux</span></h2>
		<CodeBlock code="yay -S oxmgr-bin" language="bash" />
	</div>

	<div>
		<h2 class="doc-subheading">APT — signed repository <span class="text-zinc-600 font-normal text-sm">Debian / Ubuntu (recommended for servers)</span></h2>
		<CodeBlock code={aptSigned} language="bash" />
		<p class="doc-text mt-2">Using the signed APT repository means you get automatic upgrades with <code class="code-inline">apt upgrade</code>.</p>
	</div>

	<div>
		<h2 class="doc-subheading">Build from source <span class="text-zinc-600 font-normal text-sm">Requires Rust toolchain</span></h2>
		<CodeBlock code={`git clone https://github.com/Vladimir-Urik/OxMgr.git\ncd OxMgr\ncargo build --release\n./target/release/oxmgr --help`} language="bash" />
		<p class="doc-text mt-2">
			Install the Rust toolchain with <a href="https://rustup.rs" target="_blank" rel="noopener noreferrer" class="text-zinc-300 hover:text-white underline underline-offset-2">rustup.rs</a> if you don't have it.
		</p>
	</div>

	<div>
		<h2 class="doc-subheading">Verify install</h2>
		<CodeBlock code={`oxmgr --help\noxmgr list`} language="bash" />
	</div>

	<div class="border border-zinc-800/70 rounded bg-zinc-900/30 px-5 py-4">
		<h3 class="text-sm font-semibold text-zinc-300 mb-2">Next steps</h3>
		<ul class="text-zinc-400 text-sm space-y-1.5">
			<li><a href="/docs" class="hover:text-white transition-colors">→ Quick Start</a> — write your first oxfile.toml and launch processes</li>
			<li><a href="/docs/system-services" class="hover:text-white transition-colors">→ System Services</a> — install Oxmgr as a system service for boot persistence</li>
		</ul>
	</div>
</div>

<!-- Footer CTA -->
<div class="mt-16 border border-zinc-800 rounded bg-zinc-900/30 p-6">
	<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
		<div class="flex-1">
			<h3 class="font-semibold text-white mb-1">Still have questions?</h3>
			<p class="text-zinc-400 text-sm">Open an issue or browse the source on GitHub.</p>
		</div>
		<a
			href="https://github.com/Vladimir-Urik/OxMgr/issues"
			target="_blank"
			rel="noopener noreferrer"
			class="btn-primary text-sm shrink-0"
		>
			Open an Issue ↗
		</a>
	</div>
</div>
