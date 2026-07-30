import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

/**
 * Metadata for objects in the bucket. The bytes live in R2; this row is the
 * record of what exists and who owns it.
 *
 * Rows are written AFTER the browser's direct upload succeeds, so an abandoned
 * upload leaves an orphaned object rather than a row pointing at nothing —
 * the cheaper failure to clean up.
 */
export const uploads = sqliteTable(
	'uploads',
	{
		id: text('id').primaryKey(),
		key: text('key').notNull().unique(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		contentType: text('content_type').notNull(),
		size: integer('size').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(table) => [index('uploads_user_id_idx').on(table.userId)]
);

export type Upload = typeof uploads.$inferSelect;
