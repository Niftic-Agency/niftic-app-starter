<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	/**
	 * The other half of the no-JavaScript path: the endpoint sends a browser here
	 * when the submission was rejected or could not be delivered.
	 *
	 * It does not say WHICH — the endpoint answers a bot tripping the honeypot and
	 * a person mistyping an address identically, and this page is the same answer
	 * in HTML. A human who got here by mistyping something can see their form
	 * again with one click; a script gets nothing to learn from.
	 */
</script>

<svelte:head><title>That didn't send</title></svelte:head>

<section class="mx-auto flex max-w-xl flex-col items-start gap-4 py-10">
	<h1 class="text-3xl font-medium tracking-tight">That didn't send</h1>
	<p class="text-ink-soft text-pretty">
		Something in the form wasn't right, or the message couldn't be delivered. Go back and check the
		details — and if it keeps happening, email us directly.
	</p>
	<Button href="/contact" variant="secondary">Back to the form</Button>
</section>
