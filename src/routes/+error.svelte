<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';

	const title = $derived(page.status === 404 ? 'Page not found' : 'Something went wrong');
	const detail = $derived(
		page.status === 404
			? "That page doesn't exist, or it moved."
			: (page.error?.message ?? 'An unexpected error occurred.')
	);
</script>

<section class="max-w-lg py-12">
	<p class="text-ink-mute font-mono text-sm">{page.status}</p>
	<h1 class="mt-2 text-3xl font-medium tracking-tight">{title}</h1>
	<p class="text-ink-soft mt-3 text-pretty">{detail}</p>

	<div class="mt-8">
		<Button href="/">Back to safety</Button>
	</div>

	{#if page.error?.requestId}
		<!-- Quoting this in a support request is how we find the log line. -->
		<p class="text-ink-mute mt-10 font-mono text-xs">
			Reference: {page.error.requestId}
		</p>
	{/if}
</section>
