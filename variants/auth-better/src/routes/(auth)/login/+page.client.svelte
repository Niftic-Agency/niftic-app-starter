<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import { signIn } from '$lib/auth-client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Progressive enhancement: this form posts and works with JS disabled.
	// superForm is initialised once and syncs itself on navigation, so reading
	// the initial `data.form` here is correct — not the stale-capture bug this
	// warning usually catches.
	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance, submitting } = superForm(data.form);

	let googleBusy = $state(false);

	async function withGoogle() {
		googleBusy = true;
		await signIn.social({ provider: 'google', callbackURL: '/app' });
	}
</script>

<svelte:head><title>Sign in</title></svelte:head>

<Card>
	<h1 class="text-lg font-medium tracking-tight">Sign in</h1>
	<p class="text-ink-soft mt-1 text-sm">Welcome back.</p>

	{#if $message}
		<Alert tone="danger" class="mt-4">{$message}</Alert>
	{/if}

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

	<div class="mt-4 flex items-center justify-between text-sm">
		<a href="/forgot-password" class="text-ink-soft hover:text-foreground">Forgot password?</a>
		<a href="/signup" class="text-ink-soft hover:text-foreground">Create an account</a>
	</div>

	<div class="border-line mt-6 border-t pt-6">
		<Button variant="secondary" class="w-full" onclick={withGoogle} disabled={googleBusy}>
			Continue with Google
		</Button>
	</div>
</Card>
