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

<svelte:head><title>Create an account</title></svelte:head>

<Card>
	<h1 class="text-xl font-medium">Create an account</h1>

	{#if action && 'sent' in action && action.sent}
		<Alert tone="success" class="mt-4" title="Check your email">
			If that address can be used, a confirmation link is on its way.
		</Alert>
	{:else}
		{#if action && 'error' in action && action.error}
			<Alert tone="danger" class="mt-4">{action.error}</Alert>
		{/if}

		<form method="POST" use:enhance class="mt-6 flex flex-col gap-4">
			<FormField id="displayName" label="Name" errors={$errors.displayName} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						name="displayName"
						autocomplete="name"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.displayName}
						required
					/>
				{/snippet}
			</FormField>

			<FormField id="email" label="Email" errors={$errors.email} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						name="email"
						type="email"
						autocomplete="email"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.email}
						required
					/>
				{/snippet}
			</FormField>

			<FormField
				id="password"
				label="Password"
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
				{$submitting ? 'Creating…' : 'Create account'}
			</Button>
		</form>
	{/if}

	<p class="text-ink-soft mt-6 text-sm">
		<a href="/login" class="underline">Already have an account?</a>
	</p>
</Card>
