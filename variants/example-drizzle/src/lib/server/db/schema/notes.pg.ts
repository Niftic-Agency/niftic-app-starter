import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { user } from './auth';

/** Postgres form of the notes table — column-for-column identical to the SQLite
 * version so the lite→postgres graduation path stays mechanical. */
export const notes = pgTable(
	'notes',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		body: text('body').notNull().default(''),
		/** Object key in the bucket. Null when there is no attachment, and always
		 * null on apps configured without storage. */
		attachmentKey: text('attachment_key'),
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`now()`),
		updatedAt: timestamp('updated_at')
			.notNull()
			.default(sql`now()`)
	},
	(table) => [index('notes_user_id_idx').on(table.userId)]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
