<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// superForm is initialised once and syncs itself on navigation, so reading
	// the initial `data.form` here is correct — not the stale-capture bug this
	// warning usually catches.
	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance, submitting } = superForm(data.form);
</script>

<svelte:head><title>Choose a new password</title></svelte:head>

<Card>
	<h1 class="text-lg font-medium tracking-tight">Choose a new password</h1>

	{#if !data.hasToken}
		<Alert tone="danger" class="mt-4">
			This link is missing its token. Request a new reset email.
		</Alert>
		<p class="mt-4 text-sm">
			<a href="/forgot-password" class="hover:text-foreground underline">Request a new link</a>
		</p>
	{:else}
		{#if $message}
			<Alert tone="danger" class="mt-4">{$message}</Alert>
		{/if}

		<form method="POST" use:enhance class="mt-5 flex flex-col gap-4">
			<input type="hidden" name="token" bind:value={$form.token} />

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
				{$submitting ? 'Saving…' : 'Set new password'}
			</Button>
		</form>
	{/if}
</Card>
