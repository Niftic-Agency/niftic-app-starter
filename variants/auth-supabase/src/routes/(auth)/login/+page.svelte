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

	const notice = $derived(
		data.notice === 'domain'
			? "That account isn't allowed to sign in here."
			: data.notice === 'link'
				? 'That link has expired or was already used. Ask for a new one.'
				: data.notice === 'oauth'
					? "That sign-in didn't complete. Try again."
					: null
	);
</script>

<svelte:head><title>{data.copy.title}</title></svelte:head>

<Card>
	<h1 class="text-xl font-medium">{data.copy.title}</h1>
	<p class="text-ink-soft mt-1 text-sm">{data.copy.description}</p>

	{#if notice}<Alert tone="warning" class="mt-4">{notice}</Alert>{/if}
	{#if action && 'error' in action && action.error}
		<Alert tone="danger" class="mt-4">{action.error}</Alert>
	{/if}

	{#if data.copy.showPasswordForm}
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

			<FormField id="password" label="Password" errors={$errors.password} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						name="password"
						type="password"
						autocomplete="current-password"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.password}
						required
					/>
				{/snippet}
			</FormField>

			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>
	{/if}

	{#if data.copy.showGoogle}
		<!-- Starts the PKCE flow. The code comes back to /auth/callback and is
		     exchanged for a session there, server-side, so no token ever passes
		     through client JavaScript. -->
		<form method="POST" action="/auth/oauth?provider=google" class="mt-4">
			<Button type="submit" variant="secondary" class="w-full">Continue with Google</Button>
		</form>
	{/if}

	<div class="text-ink-soft mt-6 flex flex-col gap-1 text-sm">
		{#if data.copy.showPasswordForm}
			<a href="/forgot-password" class="underline">Forgot your password?</a>
		{/if}
		{#if data.copy.showSignupLink}
			<a href="/signup" class="underline">Create an account</a>
		{/if}
	</div>
</Card>
