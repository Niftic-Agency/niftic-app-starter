<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Table from '$lib/components/Table.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'action', label: 'Action' },
		{ key: 'actor', label: 'Actor' },
		{ key: 'target', label: 'Target' },
		{ key: 'when', label: 'When', align: 'end' as const }
	];

	const formatted = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
</script>

<svelte:head><title>Admin · Audit</title></svelte:head>

{#if data.entries.length === 0}
	<EmptyState title="Nothing logged yet" description="Admin actions appear here as they happen." />
{:else}
	<Table {columns} rows={data.entries} getKey={(e: (typeof data.entries)[number]) => e.id}>
		{#snippet cell({ row, column })}
			{#if column.key === 'action'}
				<span class="font-mono text-xs">{row.action}</span>
			{:else if column.key === 'actor'}
				<span class="truncate">{row.actor_email}</span>
			{:else if column.key === 'target'}
				<span class="text-ink-mute truncate text-xs">
					{row.target_type ? `${row.target_type} ${row.target_id ?? ''}` : '—'}
				</span>
			{:else}
				<span class="text-ink-mute text-xs">{formatted.format(new Date(row.created_at))}</span>
			{/if}
		{/snippet}
	</Table>
{/if}
