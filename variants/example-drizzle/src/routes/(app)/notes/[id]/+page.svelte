<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(data.form);

	let confirming = $state(false);
</script>

<svelte:head><title>{data.note.title}</title></svelte:head>

<section class="max-w-2xl">
	<a href="/notes" class="text-ink-soft hover:text-foreground text-sm">← Notes</a>

	<Card class="mt-4">
		<form method="POST" action="?/update" use:enhance class="flex flex-col gap-4">
			<FormField id="title" label="Title" errors={$errors.title} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						name="title"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.title}
						required
					/>
				{/snippet}
			</FormField>

			<FormField id="body" label="Body" errors={$errors.body}>
				{#snippet children({ id, describedBy, invalid })}
					<Textarea
						{id}
						name="body"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.body}
					/>
				{/snippet}
			</FormField>

			<div class="flex items-center gap-2">
				<Button type="submit" disabled={$submitting}>
					{$submitting ? 'Saving…' : 'Save'}
				</Button>
				<Button variant="ghost" onclick={() => (confirming = true)}>Delete</Button>
			</div>
		</form>
	</Card>
</section>

<Dialog bind:open={confirming} title="Delete this note?" description="This cannot be undone.">
	<p class="text-ink-soft text-sm">"{data.note.title}" will be permanently removed.</p>

	{#snippet footer()}
		<Button variant="secondary" onclick={() => (confirming = false)}>Cancel</Button>
		<!-- A plain form post, so deleting still works with JS disabled. -->
		<form method="POST" action="?/delete">
			<Button type="submit" variant="danger">Delete</Button>
		</form>
	{/snippet}
</Dialog>
