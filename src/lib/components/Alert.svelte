<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type Tone = 'info' | 'success' | 'warning' | 'danger';

	type Props = {
		tone?: Tone;
		title?: string;
		class?: string;
		children?: Snippet;
	};

	let { tone = 'info', title, class: className, children }: Props = $props();

	const tones: Record<Tone, string> = {
		info: 'border-line-strong',
		success: 'border-success/40 text-success',
		warning: 'border-warning/40 text-warning',
		danger: 'border-danger/40 text-danger'
	};

	// Errors should interrupt a screen reader; the rest shouldn't.
	const live = $derived(tone === 'danger' ? 'assertive' : 'polite');
</script>

<div
	role={tone === 'danger' ? 'alert' : 'status'}
	aria-live={live}
	class={cn('rounded-md border px-4 py-3 text-sm', tones[tone], className)}
>
	{#if title}
		<p class="font-medium">{title}</p>
	{/if}
	{#if children}
		<div class={cn(title && 'mt-1', 'text-ink-soft')}>{@render children()}</div>
	{/if}
</div>
