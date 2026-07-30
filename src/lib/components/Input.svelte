<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		value?: string | number | null;
		invalid?: boolean;
		class?: string;
	} & Omit<HTMLInputAttributes, 'class' | 'value'>;

	let { value = $bindable(), invalid = false, class: className, ...rest }: Props = $props();
</script>

<input
	bind:value
	aria-invalid={invalid || undefined}
	class={cn(
		'border-line-strong bg-surface placeholder:text-ink-mute h-10 w-full rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50',
		invalid && 'border-danger',
		className
	)}
	{...rest}
/>
