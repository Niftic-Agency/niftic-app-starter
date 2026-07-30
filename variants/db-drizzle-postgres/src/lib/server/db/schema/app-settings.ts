import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Key/value application settings, editable from /admin.
 *
 * Values are JSON-encoded text rather than typed columns so adding a setting is
 * a code change, not a migration. Keep the set small — this is for things an
 * operator toggles, not a general config store.
 *
 * Column-for-column identical to the libSQL branch's version, which is what
 * keeps the documented lite→postgres graduation mechanical.
 */
export const appSettings = pgTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: timestamp('updated_at')
		.notNull()
		.default(sql`now()`)
});

export type AppSetting = typeof appSettings.$inferSelect;
