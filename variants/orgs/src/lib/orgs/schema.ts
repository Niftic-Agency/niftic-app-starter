import { z } from 'zod';
import { ASSIGNABLE_ROLES } from './roles';

/**
 * Validation lives in its own framework-neutral file so the same schema backs
 * the server action and the client-side form. Never validate in only one of the
 * two places — the client copy is a courtesy, the server copy is the rule.
 */

/**
 * The slug becomes part of a URL and is unique across the whole install, so it
 * gets the same shape as the app slug in `niftic.app.yml`: lowercase, digits and
 * inner hyphens, no leading or trailing hyphen.
 */
export const organizationSchema = z.object({
	name: z.string().trim().min(1, 'Give it a name').max(80, 'Keep the name under 80 characters'),
	slug: z
		.string()
		.trim()
		.toLowerCase()
		.regex(
			/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/,
			'Lowercase letters, digits and hyphens — it goes in a URL'
		)
});

export const inviteSchema = z.object({
	/**
	 * Normalise, THEN validate. `z.email().trim()` appends the trim after the
	 * address check, so a pasted "  Person@Example.COM " is rejected before it is
	 * ever tidied up — the opposite of what a form wants. Piping runs the string
	 * transforms first. (`.trim()` on a plain `z.string()` does run before the
	 * checks that follow it, which is why the slug above needs no pipe.)
	 */
	email: z.string().trim().toLowerCase().pipe(z.email('That does not look like an email address')),
	/**
	 * `owner` is not offered. Transferring ownership is a different operation
	 * with different consequences, and an invite form is not where it belongs.
	 */
	role: z.enum(ASSIGNABLE_ROLES).default('member')
});

export type OrganizationInput = z.infer<typeof organizationSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
