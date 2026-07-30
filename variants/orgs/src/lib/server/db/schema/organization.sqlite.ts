import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

/**
 * Better Auth's organization plugin schema.
 *
 * Its own file rather than extra tables bolted onto `auth.sqlite.ts`: that file
 * belongs to the `auth-better` variant, and two variants writing one path is a
 * hard error by design. The one thing orgs does add to the session table lives
 * there instead, as an unconditional nullable `active_organization_id`.
 *
 * Export names are Better Auth's MODEL names (`organization`, `member`,
 * `invitation`) — the Drizzle adapter looks tables up by these keys, so renaming
 * one breaks the plugin at runtime rather than at compile time. Column names are
 * ours; only the property keys matter to the adapter.
 *
 * Regenerate migrations with `pnpm db:generate` after any change here.
 */

export const organization = sqliteTable('organization', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	logo: text('logo'),
	/** Free-form JSON, written as a string by the plugin. */
	metadata: text('metadata'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const member = sqliteTable(
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
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [
		/**
		 * Better Auth does not declare this unique, and there is a narrow race it
		 * does not close: two invitations issued to the same address before either
		 * is accepted both pass the "already a member" check at invite time.
		 * Two membership rows for one user means two roles, and no answer to which
		 * one authorizes. A failed insert is the better outcome.
		 */
		uniqueIndex('member_organization_user_idx').on(t.organizationId, t.userId)
	]
);

export const invitation = sqliteTable(
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
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
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
