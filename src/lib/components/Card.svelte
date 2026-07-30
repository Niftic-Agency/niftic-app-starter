<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type Props = { class?: string; children: Snippet };
	let { class: className, children }: Props = $props();
</script>

<div class={cn('border-line bg-surface rounded-lg border p-5', className)}>
	{@render children()}
</div>
