<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form: action }: { data: PageData; form: ActionData } = $props();

	// superForm is initialised once and syncs itself on navigation, so reading
	// the initial `data.form` here is correct — not the stale-capture bug this
	// warning usually catches.
	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(data.form, { resetForm: true });

	const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head><title>Organizations</title></svelte:head>

<section class="flex flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium tracking-tight">Organizations</h1>
		<p class="text-ink-soft mt-1 text-sm">
			Everything you work on belongs to one. Switching changes what the rest of the app shows.
		</p>
	</div>

	{#if action && 'error' in action && action.error}
		<Alert tone="danger">{action.error}</Alert>
	{/if}

	{#if data.invitations.length > 0}
		<Card>
			<h2 class="font-medium">Invitations</h2>
			<ul class="mt-4 flex flex-col gap-3">
				{#each data.invitations as invitation (invitation.id)}
					<li class="flex items-center justify-between gap-4">
						<p class="text-sm">
							You've been invited as <span class="font-medium">{invitation.role}</span>.
						</p>
						<Button href="/organizations/invitations/{invitation.id}" size="sm" variant="secondary">
							Review
						</Button>
					</li>
				{/each}
			</ul>
		</Card>
	{/if}

	{#if data.organizations.length === 0}
		<EmptyState
			title="You're not in an organization yet"
			description="Create one below, or accept an invitation to join an existing one."
		/>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each data.organizations as organization (organization.id)}
				{@const active = organization.id === data.activeOrganizationId}
				<li>
					<Card>
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0">
								<h3 class="truncate font-medium">
									{organization.name}
									{#if active}
										<span class="text-ink-mute ml-2 text-xs font-normal">active</span>
									{/if}
								</h3>
								<p class="text-ink-mute mt-1 text-xs">/{organization.slug}</p>
								<p class="text-ink-mute mt-2 text-xs">
									Created {formatted.format(new Date(organization.createdAt))}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if active}
									<Button href="/organizations/members" size="sm" variant="secondary"
										>Members</Button
									>
								{:else}
									<!-- Plain form post: switching organizations rewrites the session,
									     and this is exactly the kind of thing that should keep working
									     when the client bundle doesn't load. -->
									<form method="POST" action="?/setActive">
										<input type="hidden" name="organizationId" value={organization.id} />
										<Button type="submit" size="sm" variant="secondary">Switch to</Button>
									</form>
								{/if}
								<form method="POST" action="?/leave">
									<input type="hidden" name="organizationId" value={organization.id} />
									<Button type="submit" size="sm" variant="ghost">Leave</Button>
								</form>
							</div>
						</div>
					</Card>
				</li>
			{/each}
		</ul>
	{/if}

	<Card>
		<h2 class="font-medium">New organization</h2>
		<form method="POST" action="?/create" use:enhance class="mt-4 flex flex-col gap-4">
			<FormField id="name" label="Name" errors={$errors.name} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						name="name"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.name}
						required
					/>
				{/snippet}
			</FormField>

			<FormField
				id="slug"
				label="Address"
				errors={$errors.slug}
				hint="Lowercase letters, digits and hyphens. Unique across this install."
				required
			>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						name="slug"
						aria-describedby={describedBy}
						{invalid}
						bind:value={$form.slug}
						required
					/>
				{/snippet}
			</FormField>

			<div>
				<Button type="submit" disabled={$submitting}>
					{$submitting ? 'Creating…' : 'Create organization'}
				</Button>
			</div>
		</form>
	</Card>
</section>
