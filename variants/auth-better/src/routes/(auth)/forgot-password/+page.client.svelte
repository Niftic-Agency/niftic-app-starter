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

<svelte:head><title>Reset your password</title></svelte:head>

<Card>
	<h1 class="text-lg font-medium tracking-tight">Reset your password</h1>
	<p class="text-ink-soft mt-1 text-sm">We'll email you a link.</p>

	{#if $message}
		<Alert tone="success" class="mt-4">{$message}</Alert>
	{:else}
		<form method="POST" use:enhance class="mt-5 flex flex-col gap-4">
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
			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Sending…' : 'Send reset link'}
			</Button>
		</form>
	{/if}

	<p class="text-ink-soft mt-4 text-sm">
		<a href="/login" class="hover:text-foreground underline">Back to sign in</a>
	</p>
</Card>
