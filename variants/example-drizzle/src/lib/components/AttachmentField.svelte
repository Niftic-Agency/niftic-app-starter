<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	/**
	 * The upload half of the storage flow, as the user sees it.
	 *
	 * Asks the server for a signed URL, PUTs the file straight to the bucket, and
	 * puts the returned key in a hidden field for the surrounding form. Bytes
	 * never touch the app server and no credential reaches this component.
	 *
	 * Requires JavaScript — there is no non-JS path to a direct-to-bucket upload.
	 * The surrounding form still submits without it; you just get no attachment.
	 */
	let { name = 'attachmentKey', value = $bindable<string | undefined>() } = $props();

	let status = $state<'idle' | 'uploading' | 'done' | 'error'>('idle');
	let message = $state('');
	let filename = $state('');

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		status = 'uploading';
		message = '';
		filename = file.name;

		try {
			// The server decides the key and validates type/size; we only ask.
			const issued = await fetch('/api/uploads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filename: file.name,
					contentType: file.type || 'application/octet-stream',
					size: file.size
				})
			});

			if (!issued.ok) {
				const body = await issued.json().catch(() => ({}));
				throw new Error(body.message ?? "That file can't be uploaded.");
			}

			const { key, upload: target } = await issued.json();

			// Send the signed URL back exactly as given — altering any query
			// parameter invalidates the signature and the bucket answers 403.
			const put = await fetch(target.url, {
				method: 'PUT',
				headers: target.headers,
				body: file
			});
			if (!put.ok) throw new Error('The upload was rejected.');

			value = key;
			status = 'done';
		} catch (error) {
			status = 'error';
			message = error instanceof Error ? error.message : 'Upload failed.';
		}
	}

	function clear() {
		value = undefined;
		filename = '';
		status = 'idle';
	}
</script>

<div class="flex flex-col gap-1.5">
	<span class="text-sm font-medium">Attachment</span>

	<input type="hidden" {name} value={value ?? ''} />

	{#if status === 'done'}
		<div class="flex items-center gap-2 text-sm">
			<span class="text-ink-soft truncate">{filename}</span>
			<Button size="sm" variant="ghost" onclick={clear}>Remove</Button>
		</div>
	{:else}
		<input
			type="file"
			onchange={upload}
			disabled={status === 'uploading'}
			class="text-ink-soft file:border-line-strong file:bg-surface text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
		/>
	{/if}

	{#if status === 'uploading'}
		<p class="text-ink-mute text-xs">Uploading {filename}…</p>
	{:else if status === 'error'}
		<p class="text-danger text-xs">{message}</p>
	{/if}
</div>
