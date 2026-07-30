import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

/**
 * The reference table.
 *
 * Two conventions worth copying into every new resource: an owner column with
 * `onDelete: 'cascade'` so deleting a user really removes their data, and an
 * index on that column because every query filters by it.
 */
export const notes = sqliteTable(
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
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(table) => [index('notes_user_id_idx').on(table.userId)]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
