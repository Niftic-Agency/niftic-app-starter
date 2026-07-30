<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { has } from '$lib/app-config';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<section>
	<h1 class="text-2xl font-medium tracking-tight">
		Hello, {data.user.name || data.user.email}
	</h1>

	<Card class="mt-6">
		<h2 class="font-medium">You're signed in</h2>
		<p class="text-ink-soft mt-2 text-sm">
			This is the authenticated area. Everything under <code class="font-mono text-xs">(app)</code>
			is guarded by the layout load, and every action re-checks server-side.
		</p>
		{#if !has.example}
			<p class="text-ink-mute mt-3 text-sm">
				The reference feature was pruned at setup. Ask Claude to add a resource to get started.
			</p>
		{/if}
	</Card>
</section>
