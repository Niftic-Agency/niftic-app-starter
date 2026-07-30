<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Input from '$lib/components/Input.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Admin · Settings</title></svelte:head>

{#if form && 'error' in form && form.error}
	<Alert tone="danger" class="mb-6">{form.error}</Alert>
{:else if form?.success}
	<Alert tone="success" class="mb-6">Saved.</Alert>
{/if}

{#if data.settings.length === 0}
	<EmptyState title="No settings yet" description="Run pnpm db:seed to write the defaults." />
{:else}
	<div class="flex flex-col gap-3">
		{#each data.settings as setting (setting.key)}
			<Card>
				<form method="POST" action="?/save" class="flex items-end gap-3">
					<input type="hidden" name="key" value={setting.key} />
					<div class="min-w-0 flex-1">
						<label for="v-{setting.key}" class="font-mono text-xs font-medium">
							{setting.key}
						</label>
						<Input id="v-{setting.key}" name="value" value={setting.value} class="mt-1.5" />
					</div>
					<Button type="submit" variant="secondary">Save</Button>
				</form>
			</Card>
		{/each}
	</div>
{/if}
