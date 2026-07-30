<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Table from '$lib/components/Table.svelte';
	import type { AuditEntry } from '$lib/server/db/schema/audit-log';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'createdAt', label: 'When' },
		{ key: 'actor', label: 'Who' },
		{ key: 'action', label: 'Action' },
		{ key: 'target', label: 'Target' }
	];

	const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head><title>Admin · Audit log</title></svelte:head>

{#if data.entries.length === 0}
	<EmptyState title="Nothing logged yet" description="Privileged actions appear here." />
{:else}
	<Table {columns} rows={data.entries} getKey={(e: AuditEntry) => e.id}>
		{#snippet cell({ row, column })}
			{#if column.key === 'createdAt'}
				<span class="text-ink-soft tabular-nums">{when.format(row.createdAt)}</span>
			{:else if column.key === 'actor'}
				{row.actorEmail}
			{:else if column.key === 'action'}
				<code class="font-mono text-xs">{row.action}</code>
			{:else}
				<span class="text-ink-mute font-mono text-xs">{row.targetId ?? '—'}</span>
			{/if}
		{/snippet}
	</Table>
{/if}
