<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form: action }: { data: PageData; form: ActionData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(data.form);
</script>

<svelte:head><title>Choose a new password</title></svelte:head>

<Card>
	<h1 class="text-xl font-medium">Choose a new password</h1>

	{#if action && 'error' in action && action.error}
		<Alert tone="danger" class="mt-4">{action.error}</Alert>
	{/if}

	<form method="POST" use:enhance class="mt-6 flex flex-col gap-4">
		<FormField
			id="password"
			label="New password"
			errors={$errors.password}
			hint="At least 12 characters."
			required
		>
			{#snippet children({ id, describedBy, invalid })}
				<Input
					{id}
					name="password"
					type="password"
					autocomplete="new-password"
					aria-describedby={describedBy}
					{invalid}
					bind:value={$form.password}
					required
				/>
			{/snippet}
		</FormField>

		<Button type="submit" disabled={$submitting}>
			{$submitting ? 'Saving…' : 'Set password'}
		</Button>
	</form>
</Card>
