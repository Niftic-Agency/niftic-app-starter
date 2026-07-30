<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: '/admin', label: 'Users' },
		{ href: '/admin/audit', label: 'Audit' }
	];
</script>

<div class="flex flex-1 flex-col">
	<nav class="border-line mb-8 flex items-center gap-4 border-b pb-4 text-sm" aria-label="Admin">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="text-ink-soft hover:text-foreground transition-colors"
				aria-current={page.url.pathname === tab.href ? 'page' : undefined}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
