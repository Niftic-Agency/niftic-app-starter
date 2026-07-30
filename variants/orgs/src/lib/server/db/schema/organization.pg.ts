import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Postgres form of Better Auth's organization plugin schema — column-for-column
 * identical to the SQLite version, so the lite→postgres graduation stays
 * mechanical. See `organization.sqlite.ts` for why this lives in its own file
 * and why the export names are not ours to choose.
 */

export const organization = pgTable('organization', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	logo: text('logo'),
	/** Free-form JSON, written as a string by the plugin. */
	metadata: text('metadata'),
	createdAt: timestamp('created_at').notNull()
});

export const member = pgTable(
	'member',
	{
		id: text('id').primaryKey(),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** `owner` | `admin` | `member`. Not an enum — the plugin allows custom roles. */
		role: text('role').notNull().default('member'),
		createdAt: timestamp('created_at').notNull()
	},
	(t) => [
		/** One membership per user per organization — see the SQLite file. */
		uniqueIndex('member_organization_user_idx').on(t.organizationId, t.userId)
	]
);

export const invitation = pgTable(
	'invitation',
	{
		id: text('id').primaryKey(),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		role: text('role'),
		/** `pending` | `accepted` | `rejected` | `canceled`. */
		status: text('status').notNull().default('pending'),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').notNull(),
		inviterId: text('inviter_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(t) => [
		index('invitation_organization_idx').on(t.organizationId),
		index('invitation_email_idx').on(t.email)
	]
);

export type Organization = typeof organization.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
