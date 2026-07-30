<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: '/admin', label: 'Users' },
		{ href: '/admin/settings', label: 'Settings' },
		{ href: '/admin/audit', label: 'Audit log' }
	];
</script>

<div>
	<h1 class="text-2xl font-medium tracking-tight">Admin</h1>

	<nav class="border-line mt-4 mb-8 flex gap-4 border-b text-sm" aria-label="Admin">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="hover:text-foreground -mb-px border-b-2 pb-2 transition-colors"
				class:border-transparent={page.url.pathname !== tab.href}
				class:text-ink-soft={page.url.pathname !== tab.href}
				class:border-accent={page.url.pathname === tab.href}
				aria-current={page.url.pathname === tab.href ? 'page' : undefined}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
