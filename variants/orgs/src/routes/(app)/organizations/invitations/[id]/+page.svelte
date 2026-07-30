<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form: action }: { data: PageData; form: ActionData } = $props();

	const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head><title>Join {data.invitation.organizationName}</title></svelte:head>

<section class="mx-auto flex w-full max-w-lg flex-col gap-6">
	<div>
		<h1 class="text-2xl font-medium tracking-tight">
			Join {data.invitation.organizationName}
		</h1>
		<p class="text-ink-soft mt-1 text-sm">
			{data.invitation.inviterEmail} invited {data.invitation.email} as
			{data.invitation.role}.
		</p>
	</div>

	{#if action?.error}
		<Alert tone="danger">{action.error}</Alert>
	{/if}

	<Card>
		<p class="text-ink-soft text-sm">
			Expires {formatted.format(new Date(data.invitation.expiresAt))}.
		</p>

		<!-- Two separate posts rather than one form with two submit values: an
		     accept and a reject are different operations and should read that way
		     in the markup and in the server log. -->
		<div class="mt-5 flex items-center gap-3">
			<form method="POST" action="?/accept">
				<Button type="submit">Accept invitation</Button>
			</form>
			<form method="POST" action="?/reject">
				<Button type="submit" variant="ghost">Decline</Button>
			</form>
		</div>
	</Card>
</section>
