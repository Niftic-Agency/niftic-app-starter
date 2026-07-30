<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	/**
	 * Where `/api/contact` sends a browser that posted the form without
	 * JavaScript. Prerendered like everything else — a static site cannot render
	 * a server-side outcome into the page you came from, so the outcome gets a
	 * page.
	 *
	 * With JavaScript, the form never navigates here: it renders the same message
	 * inline and this page is only ever reached by the no-JS path.
	 */
</script>

<svelte:head><title>Message sent</title></svelte:head>

<section class="mx-auto flex max-w-xl flex-col items-start gap-4 py-10">
	<h1 class="text-3xl font-medium tracking-tight">Thanks — that's sent</h1>
	<p class="text-ink-soft text-pretty">
		We've got your message and we'll come back to you at the address you gave us.
	</p>
	<Button href="/" variant="secondary">Back to the site</Button>
</section>
