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

<svelte:head><title>Create an account</title></svelte:head>

<Card>
	<h1 class="text-lg font-medium tracking-tight">Create an account</h1>

	{#if $message}
		<Alert tone="success" class="mt-4">{$message}</Alert>
	{:else}
		<form method="POST" use:enhance class="mt-5 flex flex-col gap-4">
			<FormField id="name" label="Name" errors={$errors.name} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						name="name"
						autocomplete="name"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.name}
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
						autocomplete="username"
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

	<p class="text-ink-soft mt-4 text-sm">
		Already have an account? <a href="/login" class="hover:text-foreground underline">Sign in</a>
	</p>
</Card>
