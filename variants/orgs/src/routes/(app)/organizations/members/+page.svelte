<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import Table from '$lib/components/Table.svelte';
	import {
		canManageRole,
		canRemoveMember,
		canSetRole,
		hasOrgRole,
		MANAGEABLE_ROLES
	} from '$lib/orgs/roles';
	import type { ActionData, PageData } from './$types';

	let { data, form: action }: { data: PageData; form: ActionData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(data.form, { resetForm: true });

	const manages = $derived(hasOrgRole(data.viewer.role, 'admin'));

	const columns = [
		{ key: 'person', label: 'Member' },
		{ key: 'role', label: 'Role' },
		{ key: 'actions', label: '', align: 'end' as const }
	];

	const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head><title>{data.organization.name} · Members</title></svelte:head>

<section class="flex flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium tracking-tight">{data.organization.name}</h1>
		<p class="text-ink-soft mt-1 text-sm">
			You are {data.viewer.role} here.
			<a href="/organizations" class="underline">Switch organization</a>.
		</p>
	</div>

	{#if action && 'error' in action && action.error}
		<Alert tone="danger">{action.error}</Alert>
	{/if}

	<!-- Every control below is also enforced server-side. These checks only
	     decide what to draw; `canSetRole` and `canRemoveMember` are called again
	     in the action, where it counts. -->
	<Table {columns} rows={data.members} getKey={(m: (typeof data.members)[number]) => m.id}>
		{#snippet cell({ row, column })}
			{#if column.key === 'person'}
				<div class="min-w-0">
					<p class="truncate font-medium">{row.name}</p>
					<p class="text-ink-mute truncate text-xs">{row.email}</p>
				</div>
			{:else if column.key === 'role'}
				{#if manages && row.id !== data.viewer.memberId && canManageRole(data.viewer.role, row.role)}
					<form method="POST" action="?/setRole" class="flex items-center gap-2">
						<input type="hidden" name="memberId" value={row.id} />
						<label class="sr-only" for="role-{row.id}">Role for {row.email}</label>
						<select
							id="role-{row.id}"
							name="role"
							value={row.role}
							class="border-line-strong bg-surface h-8 rounded-md border px-2 text-sm"
						>
							{#each MANAGEABLE_ROLES as role (role)}
								{#if canSetRole(data.viewer.role, row.role, role)}
									<option value={role}>{role}</option>
								{/if}
							{/each}
						</select>
						<Button type="submit" size="sm" variant="secondary">Set</Button>
					</form>
				{:else}
					<span class="text-ink-mute text-xs">{row.role}</span>
				{/if}
			{:else if manages && row.id !== data.viewer.memberId && canRemoveMember(data.viewer.role, row.role)}
				<form method="POST" action="?/remove">
					<input type="hidden" name="memberId" value={row.id} />
					<Button type="submit" size="sm" variant="ghost">Remove</Button>
				</form>
			{/if}
		{/snippet}
	</Table>

	{#if manages}
		<Card>
			<h2 class="font-medium">Invite someone</h2>
			<p class="text-ink-soft mt-1 text-sm">
				They get an email with a single-use link. It expires in 48 hours.
			</p>

			<form method="POST" action="?/invite" use:enhance class="mt-4 flex flex-col gap-4">
				<FormField id="email" label="Email" errors={$errors.email} required>
					{#snippet children({ id, describedBy, invalid })}
						<Input
							{id}
							name="email"
							type="email"
							aria-describedby={describedBy}
							{invalid}
							bind:value={$form.email}
							required
						/>
					{/snippet}
				</FormField>

				<FormField id="role" label="Role" errors={$errors.role}>
					{#snippet children({ id, describedBy, invalid })}
						<select
							{id}
							name="role"
							aria-describedby={describedBy}
							aria-invalid={invalid || undefined}
							bind:value={$form.role}
							class="border-line-strong bg-surface h-10 w-full rounded-md border px-3 text-sm"
						>
							<option value="member">member</option>
							<option value="admin">admin</option>
						</select>
					{/snippet}
				</FormField>

				<div>
					<Button type="submit" disabled={$submitting}>
						{$submitting ? 'Sending…' : 'Send invitation'}
					</Button>
				</div>
			</form>

			{#if data.invitations.length > 0}
				<ul class="border-line mt-6 flex flex-col gap-2 border-t pt-4">
					{#each data.invitations as invitation (invitation.id)}
						<li class="flex items-center justify-between gap-4 text-sm">
							<div class="min-w-0">
								<p class="truncate">{invitation.email}</p>
								<p class="text-ink-mute text-xs">
									{invitation.role} · expires {formatted.format(new Date(invitation.expiresAt))}
								</p>
							</div>
							<form method="POST" action="?/cancelInvite">
								<input type="hidden" name="invitationId" value={invitation.id} />
								<Button type="submit" size="sm" variant="ghost">Cancel</Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	{/if}
</section>
