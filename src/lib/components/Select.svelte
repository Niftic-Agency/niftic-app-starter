<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	type Props = {
		value?: string | number | null;
		invalid?: boolean;
		class?: string;
		children: Snippet;
	} & Omit<HTMLSelectAttributes, 'class' | 'value'>;

	let {
		value = $bindable(),
		invalid = false,
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<!-- Native <select>. Don't replace this with a div-based listbox: the native
     control already handles keyboard, mobile and assistive tech correctly. -->
<select
	bind:value
	aria-invalid={invalid || undefined}
	class={cn(
		'border-line-strong bg-surface h-10 w-full rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50',
		invalid && 'border-danger',
		className
	)}
	{...rest}
>
	{@render children()}
</select>
