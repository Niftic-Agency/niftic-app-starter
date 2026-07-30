<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<section class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-medium tracking-tight">
			{data.user.displayName ?? 'Welcome'}
		</h1>
		<p class="text-ink-soft mt-1 text-sm">{data.user.email}</p>
	</div>

	<Card>
		<h2 class="font-medium">You're signed in</h2>
		<p class="text-ink-soft mt-2 text-sm">
			Your role is <span class="font-mono text-xs">{data.user.role}</span>, read from your own
			profile row through your own client — so the same policy that protects it from everyone else
			applies to you reading it.
		</p>
	</Card>
</section>
