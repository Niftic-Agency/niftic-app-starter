<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import { contactSchema, HONEYPOT_FIELD } from '$lib/contact/schema';
	import type { ZodError } from 'zod';

	/**
	 * Prerendered, and posts to `/api/contact`.
	 *
	 * No superforms here, unlike every other form in this repo: superforms is
	 * built around a form action returning a `$page.form`, and a prerendered page
	 * has no server side to return one. So this is a plain form that works
	 * without JavaScript — the endpoint answers a browser post with a redirect to
	 * a prerendered page — and progressively enhances into an inline experience
	 * when the bundle has loaded.
	 */

	type Errors = Partial<Record<string, string[]>>;

	/**
	 * Zod 4 moved flatten off the error and onto the namespace, and the shape it
	 * returns is not the one `FormField` wants anyway — so this maps issues to
	 * `{ field: [message] }` directly, which is also the shape the endpoint sends
	 * back.
	 */
	function fieldErrorsOf(error: ZodError): Errors {
		const out: Errors = {};
		for (const issue of error.issues) {
			const key = String(issue.path[0] ?? '');
			(out[key] ??= []).push(issue.message);
		}
		return out;
	}

	let errors = $state<Errors>({});
	let failed = $state(false);
	let sent = $state(false);
	let submitting = $state(false);

	/**
	 * The enhancement is the existence of this handler. There is no "is JS ready"
	 * flag to check: if the bundle never loads, nothing binds this, the browser
	 * performs the plain POST in the markup, and the endpoint answers it with a
	 * redirect. Both paths are real, and neither knows about the other.
	 */
	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();

		const form = event.currentTarget as HTMLFormElement;
		const data = new FormData(form);

		// Client-side validation is the courtesy half. The endpoint re-validates
		// the same schema, and that is the half that decides.
		const parsed = contactSchema.safeParse(Object.fromEntries(data));
		if (!parsed.success) {
			errors = fieldErrorsOf(parsed.error);
			failed = false;
			return;
		}

		submitting = true;
		errors = {};
		failed = false;

		try {
			const response = await fetch('/api/contact', {
				method: 'POST',
				headers: { accept: 'application/json' },
				body: data
			});
			const result = await response.json().catch(() => ({ ok: false, errors: {} }));

			if (result.ok) {
				sent = true;
				form.reset();
			} else {
				errors = result.errors ?? {};
				failed = Object.keys(errors).length === 0;
			}
		} catch {
			failed = true;
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Contact</title></svelte:head>

<section class="mx-auto flex w-full max-w-xl flex-col gap-6">
	<div>
		<h1 class="text-3xl font-medium tracking-tight">Get in touch</h1>
		<p class="text-ink-soft mt-2 text-pretty">
			Tell us what you're working on and we'll come back to you.
		</p>
	</div>

	{#if sent}
		<Alert tone="success" title="Message sent">Thanks — we'll be in touch shortly.</Alert>
	{/if}

	{#if failed}
		<Alert tone="danger" title="That didn't send">
			Something went wrong on our side. Try again, or email us directly.
		</Alert>
	{/if}

	<Card>
		<form method="POST" action="/api/contact" {onsubmit} class="flex flex-col gap-4">
			<FormField id="name" label="Name" errors={errors.name} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input {id} name="name" aria-describedby={describedBy} {invalid} required />
				{/snippet}
			</FormField>

			<FormField id="email" label="Email" errors={errors.email} required>
				{#snippet children({ id, describedBy, invalid })}
					<Input {id} name="email" type="email" aria-describedby={describedBy} {invalid} required />
				{/snippet}
			</FormField>

			<FormField id="subject" label="Subject" errors={errors.subject}>
				{#snippet children({ id, describedBy, invalid })}
					<Input {id} name="subject" aria-describedby={describedBy} {invalid} />
				{/snippet}
			</FormField>

			<FormField id="message" label="Message" errors={errors.message} required>
				{#snippet children({ id, describedBy, invalid })}
					<Textarea
						{id}
						name="message"
						rows={6}
						aria-describedby={describedBy}
						{invalid}
						required
					/>
				{/snippet}
			</FormField>

			<!--
				The honeypot. Not `type="hidden"` — that is precisely what a bot skips.
				It is a real text input, moved off-screen, taken out of the tab order
				and hidden from assistive tech, so no person can fill it in by
				accident and a script filling every input trips it.
			-->
			<div class="absolute left-[-9999px]" aria-hidden="true">
				<label for={HONEYPOT_FIELD}>Company website</label>
				<input
					id={HONEYPOT_FIELD}
					name={HONEYPOT_FIELD}
					type="text"
					tabindex="-1"
					autocomplete="off"
				/>
			</div>

			<div>
				<Button type="submit" disabled={submitting}>
					{submitting ? 'Sending…' : 'Send message'}
				</Button>
			</div>
		</form>
	</Card>
</section>
