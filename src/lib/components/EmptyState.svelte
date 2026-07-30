<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description?: string;
		class?: string;
		/** Primary call to action. */
		action?: Snippet;
	};

	let { title, description, class: className, action }: Props = $props();
</script>

<div
	class={cn(
		'border-line-strong flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center',
		className
	)}
>
	<p class="font-medium">{title}</p>
	{#if description}
		<p class="text-ink-soft mt-1 max-w-sm text-sm text-pretty">{description}</p>
	{/if}
	{#if action}
		<div class="mt-5">{@render action()}</div>
	{/if}
</div>
