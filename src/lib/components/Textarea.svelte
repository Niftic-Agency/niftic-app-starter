<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	type Props = {
		value?: string | null;
		invalid?: boolean;
		class?: string;
	} & Omit<HTMLTextareaAttributes, 'class' | 'value'>;

	let { value = $bindable(), invalid = false, class: className, ...rest }: Props = $props();
</script>

<textarea
	bind:value
	aria-invalid={invalid || undefined}
	class={cn(
		'border-line-strong bg-surface placeholder:text-ink-mute min-h-24 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50',
		invalid && 'border-danger',
		className
	)}
	{...rest}></textarea>
