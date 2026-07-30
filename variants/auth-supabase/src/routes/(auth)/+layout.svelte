<script lang="ts">
	import { appConfig } from '$lib/app-config';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="mx-auto flex w-full max-w-sm flex-col justify-center py-12">
	<a href="/" class="mb-8 text-center font-medium tracking-tight">{appConfig.title}</a>
	{@render children()}
</div>
