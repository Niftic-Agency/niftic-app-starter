<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type Props = {
		/** Must match the `id` on the control rendered in `children`. */
		id: string;
		label: string;
		/** Superforms puts its messages in a string[]; a bare string works too. */
		errors?: string[] | string | null;
		hint?: string;
		required?: boolean;
		class?: string;
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	};

	let { id, label, errors, hint, required = false, class: className, children }: Props = $props();

	const messages = $derived(
		errors == null ? [] : Array.isArray(errors) ? errors.filter(Boolean) : [errors]
	);
	const invalid = $derived(messages.length > 0);
	const errorId = $derived(`${id}-error`);
	const hintId = $derived(`${id}-hint`);

	// Point aria-describedby at whichever of hint/error actually rendered.
	const describedBy = $derived(
		[hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined
	);
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	<label for={id} class="text-sm font-medium">
		{label}
		{#if required}
			<span class="text-danger" aria-hidden="true">*</span>
			<span class="sr-only">(required)</span>
		{/if}
	</label>

	{@render children({ id, describedBy, invalid })}

	{#if hint && !invalid}
		<p id={hintId} class="text-ink-mute text-xs">{hint}</p>
	{/if}

	{#if invalid}
		<p id={errorId} class="text-danger text-xs">{messages.join('. ')}</p>
	{/if}
</div>
