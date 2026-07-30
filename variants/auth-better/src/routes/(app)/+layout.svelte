<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { navItems } from '$lib/registry/nav';
	import { signOut } from '$lib/auth-client';
	import Button from '$lib/components/Button.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Registry-driven, filtered by the signed-in user's role, so `admin`, `orgs`
	// and the example feature can each contribute links without owning this file.
	const links = $derived(
		navItems
			.filter((item) => item.area === 'app')
			.filter((item) => !item.role || item.role === data.user.role || data.user.role === 'admin')
			.sort((a, b) => a.order - b.order)
	);

	async function leave() {
		await signOut();
		await goto('/login');
	}
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
			<span class="text-ink-mute">{data.user.email}</span>
			<Button size="sm" variant="ghost" onclick={leave}>Sign out</Button>
		</div>
	</nav>

	{@render children()}
</div>
