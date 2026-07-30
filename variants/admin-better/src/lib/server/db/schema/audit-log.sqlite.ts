import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Append-only record of privileged actions.
 *
 * No foreign key to `user`: the actor's id is kept as plain text so deleting a
 * user cannot cascade away the evidence of what they did. The denormalised
 * email is there for the same reason — the log has to stay readable after the
 * account is gone.
 */
export const auditLog = sqliteTable(
	'audit_log',
	{
		id: text('id').primaryKey(),
		actorId: text('actor_id').notNull(),
		actorEmail: text('actor_email').notNull(),
		action: text('action').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		/** JSON-encoded. Never put secrets or full record bodies in here. */
		detail: text('detail'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(table) => [index('audit_log_created_at_idx').on(table.createdAt)]
);

export type AuditEntry = typeof auditLog.$inferSelect;
