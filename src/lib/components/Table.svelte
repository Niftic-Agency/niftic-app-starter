<script lang="ts" generics="Row">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type Column = {
		key: string;
		label: string;
		/** Right-align numeric columns. */
		align?: 'start' | 'end';
	};

	type Props = {
		caption?: string;
		columns: Column[];
		rows: Row[];
		/** Stable identity per row — avoids re-rendering the whole body on change. */
		getKey: (row: Row) => string | number;
		cell: Snippet<[{ row: Row; column: Column }]>;
		class?: string;
	};

	let { caption, columns, rows, getKey, cell, class: className }: Props = $props();
</script>

<!-- Horizontal scroll lives on the wrapper so the page body never scrolls sideways. -->
<div class={cn('w-full overflow-x-auto', className)}>
	<table class="w-full border-collapse text-sm">
		{#if caption}
			<caption class="text-ink-soft pb-3 text-left text-sm">{caption}</caption>
		{/if}
		<thead>
			<tr class="border-line border-b">
				{#each columns as column (column.key)}
					<th
						scope="col"
						class={cn(
							'text-ink-soft px-3 py-2 font-medium',
							column.align === 'end' ? 'text-right' : 'text-left'
						)}
					>
						{column.label}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row (getKey(row))}
				<tr class="border-line border-b last:border-0">
					{#each columns as column (column.key)}
						<td class={cn('px-3 py-2.5', column.align === 'end' && 'text-right tabular-nums')}>
							{@render cell({ row, column })}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
