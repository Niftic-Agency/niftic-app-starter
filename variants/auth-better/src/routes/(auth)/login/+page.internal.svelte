<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import { signIn } from '$lib/auth-client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state(false);

	async function withGoogle() {
		busy = true;
		await signIn.social({ provider: 'google', callbackURL: '/app' });
	}
</script>

<svelte:head><title>Sign in</title></svelte:head>

<Card>
	<h1 class="text-lg font-medium tracking-tight">Sign in</h1>
	<p class="text-ink-soft mt-1 text-sm">Use your work Google account.</p>

	{#if data.domainRejected}
		<Alert tone="danger" title="That account can't be used here" class="mt-4">
			Sign in with your work account. If you think this is wrong, ask an administrator to check the
			allowed domains.
		</Alert>
	{/if}

	<div class="mt-5">
		<Button class="w-full" onclick={withGoogle} disabled={busy}>
			{busy ? 'Redirecting…' : 'Continue with Google'}
		</Button>
	</div>
</Card>
