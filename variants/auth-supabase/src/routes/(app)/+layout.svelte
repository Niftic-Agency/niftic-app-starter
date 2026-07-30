<script lang="ts">
	import { page } from '$app/state';
	import { navItems } from '$lib/registry/nav';
	import Button from '$lib/components/Button.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Registry-driven and filtered by role, so `admin` and the example feature
	// contribute links without owning this file.
	const links = $derived(
		navItems
			.filter((item) => item.area === 'app')
			.filter((item) => !item.role || item.role === data.user.role || data.user.role === 'admin')
			.sort((a, b) => a.order - b.order)
	);
</script>

<div class="flex flex-1 flex-col">
	<nav
		class="border-line mb-8 flex items-center gap-4 border-b pb-4 text-sm"
		aria-label="Application"
	>
		{#each links as item (item.href)}
			<a
				href={item.href}
				class="text-ink-soft hover:text-foreground transition-colors"
				aria-current={page.url.pathname === item.href ? 'page' : undefined}
			>
				{item.label}
			</a>
		{/each}

		<div class="ml-auto flex items-center gap-3">
			<span class="text-ink-mute text-xs">{data.user.email}</span>
			<!-- A plain POST, not a link: a GET sign-out can be triggered by any
			     image tag on any page. -->
			<form method="POST" action="/auth/signout">
				<Button type="submit" size="sm" variant="ghost">Sign out</Button>
			</form>
		</div>
	</nav>

	{@render children()}
</div>
