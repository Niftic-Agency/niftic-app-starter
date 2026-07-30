import { z } from 'zod';

/**
 * Validation lives in its own framework-neutral file so the same schema backs
 * the server action and the client-side form. Never validate in only one of the
 * two places — the client copy is a courtesy, the server copy is the rule.
 */

const email = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email('That does not look like an email address'));

/**
 * 12 characters, matching the Better Auth branch. Set the same minimum in the
 * Supabase dashboard too: this schema guards the form, and the dashboard guards
 * every other way an account can be created.
 */
const password = z.string().min(12, 'Use at least 12 characters').max(200);

export const signInSchema = z.object({
	email,
	password: z.string().min(1, 'Enter your password')
});

export const signUpSchema = z.object({
	displayName: z.string().trim().min(1, 'Tell us your name').max(120),
	email,
	password
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password });
