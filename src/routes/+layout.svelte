<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { appConfig } from '$lib/app-config';
	import { navItems } from '$lib/registry/nav';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// Base owns this layout and no variant replaces it — links come from the nav
	// registry so `admin`, `orgs` and `example` can each contribute without any
	// of them taking ownership of the shell.
	const siteNav = $derived(
		navItems.filter((item) => item.area === 'site').sort((a, b) => a.order - b.order)
	);
</script>

<svelte:head>
	<title>{appConfig.title}</title>
	<meta name="description" content={appConfig.description} />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="border-line border-b">
		<nav class="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4" aria-label="Main">
			<a href="/" class="font-medium tracking-tight">{appConfig.title}</a>
			<ul class="flex items-center gap-4 text-sm">
				{#each siteNav as item (item.href)}
					<li>
						<a
							href={item.href}
							class="text-ink-soft hover:text-foreground transition-colors"
							aria-current={page.url.pathname === item.href ? 'page' : undefined}
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
		{@render children()}
	</main>

	<footer class="border-line border-t">
		<div class="text-ink-mute mx-auto max-w-5xl px-6 py-6 text-sm">
			{appConfig.title}
		</div>
	</footer>
</div>
