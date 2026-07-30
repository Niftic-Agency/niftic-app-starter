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

<svelte:head><title>Reset your password</title></svelte:head>

<Card>
	<h1 class="text-xl font-medium">Reset your password</h1>

	{#if action && 'sent' in action && action.sent}
		<!-- The same message whether or not the address has an account. Anything
		     more specific tells a stranger who is a customer. -->
		<Alert tone="success" class="mt-4" title="Check your email">
			If that address has an account, a reset link is on its way.
		</Alert>
	{:else}
		<p class="text-ink-soft mt-1 text-sm">We'll send you a link to choose a new one.</p>

		<form method="POST" use:enhance class="mt-6 flex flex-col gap-4">
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

			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Sending…' : 'Send reset link'}
			</Button>
		</form>
	{/if}

	<p class="text-ink-soft mt-6 text-sm"><a href="/login" class="underline">Back to sign in</a></p>
</Card>
