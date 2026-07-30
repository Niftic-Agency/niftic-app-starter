<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Table from '$lib/components/Table.svelte';
	import type { AdminUser } from '$lib/server/db/repos/admin';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const columns = [
		{ key: 'email', label: 'User' },
		{ key: 'role', label: 'Role' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: '', align: 'end' as const }
	];
</script>

<svelte:head><title>Admin · Users</title></svelte:head>

{#if form && 'error' in form && form.error}
	<Alert tone="danger" class="mb-6">{form.error}</Alert>
{/if}

<!-- Plain form posts throughout: admin is exactly where you want things to keep
     working when the client bundle fails to load. -->
<Table {columns} rows={data.users} getKey={(u: AdminUser) => u.id}>
	{#snippet cell({ row, column })}
		{#if column.key === 'email'}
			<div class="min-w-0">
				<p class="truncate font-medium">{row.email}</p>
				{#if row.name}<p class="text-ink-mute truncate text-xs">{row.name}</p>{/if}
			</div>
		{:else if column.key === 'role'}
			<form method="POST" action="?/setRole" class="flex items-center gap-2">
				<input type="hidden" name="userId" value={row.id} />
				<select
					name="role"
					value={row.role ?? 'user'}
					class="border-line-strong bg-surface h-8 rounded-md border px-2 text-sm"
				>
					<option value="user">user</option>
					<option value="admin">admin</option>
				</select>
				<Button type="submit" size="sm" variant="secondary">Set</Button>
			</form>
		{:else if column.key === 'status'}
			{#if row.banned}
				<span class="text-danger text-xs">banned</span>
			{:else}
				<span class="text-ink-mute text-xs">active</span>
			{/if}
		{:else}
			<form method="POST" action="?/setBanned">
				<input type="hidden" name="userId" value={row.id} />
				<input type="hidden" name="banned" value={row.banned ? 'false' : 'true'} />
				<Button type="submit" size="sm" variant={row.banned ? 'secondary' : 'ghost'}>
					{row.banned ? 'Unban' : 'Ban'}
				</Button>
			</form>
		{/if}
	{/snippet}
</Table>
