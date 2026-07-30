<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Table from '$lib/components/Table.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form: action }: { data: PageData; form: ActionData } = $props();

	const columns = [
		{ key: 'email', label: 'User' },
		{ key: 'role', label: 'Role' }
	];
</script>

<svelte:head><title>Admin · Users</title></svelte:head>

{#if action && 'error' in action && action.error}
	<Alert tone="danger" class="mb-6">{action.error}</Alert>
{/if}

<!-- Plain form posts throughout: admin is exactly where you want things to keep
     working when the client bundle fails to load. -->
<Table {columns} rows={data.profiles} getKey={(p: (typeof data.profiles)[number]) => p.user_id}>
	{#snippet cell({ row, column })}
		{#if column.key === 'email'}
			<div class="min-w-0">
				<p class="truncate font-medium">{row.email}</p>
				{#if row.display_name}
					<p class="text-ink-mute truncate text-xs">{row.display_name}</p>
				{/if}
			</div>
		{:else}
			<form method="POST" action="?/setRole" class="flex items-center gap-2">
				<input type="hidden" name="userId" value={row.user_id} />
				<label class="sr-only" for="role-{row.user_id}">Role for {row.email}</label>
				<select
					id="role-{row.user_id}"
					name="role"
					value={row.role}
					class="border-line-strong bg-surface h-8 rounded-md border px-2 text-sm"
				>
					<option value="member">member</option>
					<option value="admin">admin</option>
				</select>
				<Button type="submit" size="sm" variant="secondary">Set</Button>
			</form>
		{/if}
	{/snippet}
</Table>
