<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form: action }: { data: PageData; form: ActionData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(data.form, { resetForm: true });

	const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head><title>Notes</title></svelte:head>

<section class="flex flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium tracking-tight">Notes</h1>
		<p class="text-ink-soft mt-1 text-sm">
			The reference feature. Every new resource is cloned from this slice — policies included.
		</p>
	</div>

	{#if action && 'error' in action && action.error}
		<Alert tone="danger">{action.error}</Alert>
	{/if}

	<Card>
		<h2 class="font-medium">New note</h2>
		<form method="POST" action="?/create" use:enhance class="mt-4 flex flex-col gap-4">
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

			<div>
				<Button type="submit" disabled={$submitting}>
					{$submitting ? 'Saving…' : 'Add note'}
				</Button>
			</div>
		</form>
	</Card>

	{#if data.notes.length === 0}
		<EmptyState
			title="No notes yet"
			description="Add one above. It will appear here immediately."
		/>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each data.notes as note (note.id)}
				<li>
					<Card>
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0">
								<h3 class="truncate font-medium">{note.title}</h3>
								{#if note.body}
									<p class="text-ink-soft mt-1 text-sm whitespace-pre-wrap">{note.body}</p>
								{/if}
								<p class="text-ink-mute mt-2 text-xs">
									Updated {formatted.format(new Date(note.updated_at))}
								</p>
							</div>
							<form method="POST" action="?/delete">
								<input type="hidden" name="id" value={note.id} />
								<Button type="submit" size="sm" variant="ghost">Delete</Button>
							</form>
						</div>
					</Card>
				</li>
			{/each}
		</ul>
	{/if}
</section>
