<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type Props = {
		open?: boolean;
		title: string;
		description?: string;
		class?: string;
		children: Snippet;
		footer?: Snippet;
	};

	let {
		open = $bindable(false),
		title,
		description,
		class: className,
		children,
		footer
	}: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	// Native <dialog> gives focus trapping, Esc-to-close, inertness of the
	// background and the top layer for free. Drive it through showModal()/close()
	// rather than the `open` attribute, which does none of that.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	aria-labelledby="dialog-title"
	aria-describedby={description ? 'dialog-description' : undefined}
	class={cn(
		'border-line bg-surface text-foreground m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border p-6 backdrop:bg-black/40',
		className
	)}
>
	<h2 id="dialog-title" class="text-lg font-medium tracking-tight">{title}</h2>
	{#if description}
		<p id="dialog-description" class="text-ink-soft mt-1 text-sm">{description}</p>
	{/if}

	<div class="mt-4">{@render children()}</div>

	{#if footer}
		<div class="mt-6 flex justify-end gap-2">{@render footer()}</div>
	{/if}
</dialog>
