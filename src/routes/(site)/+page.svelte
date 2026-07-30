<script lang="ts">
	import { appConfig, has, isConfigured } from '$lib/app-config';
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';

	const capabilities = Object.entries(has).filter(([, enabled]) => enabled);
</script>

<section class="max-w-2xl">
	<h1 class="text-4xl font-medium tracking-tight text-balance">{appConfig.title}</h1>
	<p class="text-ink-soft mt-4 text-lg text-pretty">{appConfig.description}</p>

	{#if !isConfigured}
		<Card class="mt-10">
			<h2 class="font-medium">This repo hasn't been configured yet</h2>
			<p class="text-ink-soft mt-2 text-sm">
				Edit <code class="font-mono text-xs">niftic.app.yml</code>, then run
				<code class="font-mono text-xs">pnpm configure</code>. That prunes this superset down to one
				concrete app and removes itself.
			</p>
			<div class="mt-4">
				<Button href="/api/health" variant="secondary">Check health</Button>
			</div>
		</Card>
	{:else if capabilities.length > 0}
		<ul class="mt-10 flex flex-wrap gap-2">
			{#each capabilities as [name] (name)}
				<li
					class="border-line text-ink-soft rounded-md border px-2.5 py-1 font-mono text-xs lowercase"
				>
					{name}
				</li>
			{/each}
		</ul>
	{/if}
</section>
