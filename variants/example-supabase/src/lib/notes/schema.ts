import { z } from 'zod';

/**
 * Validation lives in its own framework-neutral file so the same schema backs
 * the server action and the client-side form. Never validate in only one of the
 * two places — the client copy is a courtesy, the server copy is the rule.
 *
 * Character-for-character the same schema as the Drizzle branch's. The two
 * example variants are mutually exclusive, and keeping them identical is what
 * makes the branches comparable.
 */
export const noteSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, 'Give it a title')
		.max(200, 'Keep the title under 200 characters'),
	body: z.string().trim().max(10_000, 'Keep the note under 10,000 characters').default(''),
	attachmentKey: z.string().max(500).optional()
});

export type NoteInput = z.infer<typeof noteSchema>;
