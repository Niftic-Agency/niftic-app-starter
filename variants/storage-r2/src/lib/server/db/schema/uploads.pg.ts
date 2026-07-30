import { sql } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { user } from './auth';

/** Postgres form of the uploads table. Kept column-for-column identical to the
 * SQLite version so the lite→postgres graduation path stays mechanical. */
export const uploads = pgTable(
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
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`now()`)
	},
	(table) => [index('uploads_user_id_idx').on(table.userId)]
);

export type Upload = typeof uploads.$inferSelect;
