import { json, redirect } from '@sveltejs/kit';
// `z.flattenError(err)` in Zod 4, not the `err.flatten()` of Zod 3.
import { z } from 'zod';
import { contactSchema } from '$lib/contact/schema';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { sendEmail } from '$lib/server/email';
import type { RequestHandler } from './$types';

/**
 * POST /api/contact
 *
 * An endpoint rather than a form action, because the page it serves is
 * prerendered and a page with actions cannot be. That is the one place the
 * static profile departs from the repo-wide "mutations go through form actions"
 * rule, and it departs from the mechanism rather than the substance: the payload
 * is still Zod-validated server-side, and the client-side copy of the schema is
 * still only a courtesy.
 *
 * Answers two kinds of caller:
 *
 *   - `fetch` from the enhanced form  → JSON, so errors render inline.
 *   - a plain form POST with no JS    → 303 to a prerendered page.
 *
 * The second is why the redirect targets exist at all. A prerendered site has no
 * way to render a server-side error into the page you came from, so success and
 * failure each get a small page of their own.
 */

const THANKS = '/contact/thanks';
const PROBLEM = '/contact/problem';

/** A plain browser form post asks for HTML; `fetch` from our form asks for JSON. */
function wantsJson(request: Request): boolean {
	return (request.headers.get('accept') ?? '').includes('application/json');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const parsed = contactSchema.safeParse(Object.fromEntries(form));

	if (!parsed.success) {
		// Deliberately the same answer for a bot tripping the honeypot and a human
		// mistyping an address. Telling a bot which field gave it away is free
		// advice, and the honeypot is worth more the longer it stays boring.
		logger.warn('contact.rejected', { requestId: locals.requestId });

		if (wantsJson(request)) {
			return json({ ok: false, errors: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
		}
		redirect(303, PROBLEM);
	}

	const { name, email, subject, message } = parsed.data;

	const result = await sendEmail({
		to: env().CONTACT_TO,
		template: 'contactNotification',
		data: { name, email, message, ...(subject ? { subject } : {}) },
		// So hitting reply in the inbox reaches the person who wrote it, rather
		// than the app's own from-address.
		replyTo: email
	});

	if (!result.ok) {
		// The message is lost at this point, so say so rather than showing a
		// thank-you page for something nobody received.
		logger.error('contact.send_failed', { requestId: locals.requestId });

		if (wantsJson(request)) {
			return json({ ok: false, errors: {} }, { status: 502 });
		}
		redirect(303, PROBLEM);
	}

	logger.info('contact.sent', { requestId: locals.requestId, dryRun: result.dryRun });

	if (wantsJson(request)) return json({ ok: true });
	redirect(303, THANKS);
};

// The root layout prerenders everything; this one has to run per request.
export const prerender = false;
