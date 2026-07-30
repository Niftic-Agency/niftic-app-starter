import { z } from 'zod';

/**
 * Validation lives in its own framework-neutral file so the same schema backs
 * the endpoint and the client-side form. Never validate in only one of the two
 * places — the client copy is a courtesy, the server copy is the rule.
 */

/**
 * The honeypot field.
 *
 * Rendered, given a name a bot will want to fill, and hidden from people with
 * CSS and `aria-hidden` rather than `type="hidden"` — a hidden input is exactly
 * what a bot skips. A human never sees it, so a non-empty value is a bot.
 *
 * Kept deliberately boring: this stops drive-by form spam and nothing else. Real
 * abuse needs rate limiting, which is out of scope for v1 and would want a
 * shared store this profile does not have.
 */
export const HONEYPOT_FIELD = 'company_website';

export const contactSchema = z.object({
	name: z.string().trim().min(1, 'Tell us your name').max(120, 'Keep it under 120 characters'),
	// Normalise, THEN validate — `z.email().trim()` appends the trim after the
	// address check, so a pasted address with a stray space is rejected before it
	// is ever tidied up.
	email: z.string().trim().toLowerCase().pipe(z.email('That does not look like an email address')),
	subject: z.string().trim().max(160, 'Keep the subject under 160 characters').optional(),
	message: z
		.string()
		.trim()
		.min(1, 'Say something')
		.max(5000, 'Keep the message under 5,000 characters'),
	/**
	 * Must be absent or empty. Modelled in the schema rather than checked
	 * separately so it cannot be forgotten by whoever copies this endpoint.
	 */
	[HONEYPOT_FIELD]: z
		.string()
		.max(0, 'Rejected')
		.optional()
		.transform(() => undefined)
});

export type ContactInput = z.infer<typeof contactSchema>;
