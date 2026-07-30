import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Key/value application settings, editable from /admin.
 *
 * Values are JSON-encoded text rather than typed columns so adding a setting is
 * a code change, not a migration. Keep the set small — this is for things an
 * operator toggles, not a general config store.
 */
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export type AppSetting = typeof appSettings.$inferSelect;
