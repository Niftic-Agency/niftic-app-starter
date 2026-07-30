import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

/** Postgres form of the audit log. See the SQLite version for why there is no
 * foreign key on the actor. */
export const auditLog = pgTable(
	'audit_log',
	{
		id: text('id').primaryKey(),
		actorId: text('actor_id').notNull(),
		actorEmail: text('actor_email').notNull(),
		action: text('action').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		detail: text('detail'),
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`now()`)
	},
	(table) => [index('audit_log_created_at_idx').on(table.createdAt)]
);

export type AuditEntry = typeof auditLog.$inferSelect;
