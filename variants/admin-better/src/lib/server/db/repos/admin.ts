import { asc, desc } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { AuditEntry } from '$lib/server/db/schema/audit-log';

/**
 * Read-side queries for /admin. Mutations deliberately do NOT live here — user
 * role and ban changes go through Better Auth's admin plugin so that session
 * revocation happens too, which a direct table write would skip.
 */

export interface AdminUser {
	id: string;
	name: string;
	email: string;
	role: string | null;
	banned: boolean | null;
	createdAt: Date;
}

export async function listUsers(limit = 200): Promise<AdminUser[]> {
	return db()
		.select({
			id: schema.user.id,
			name: schema.user.name,
			email: schema.user.email,
			role: schema.user.role,
			banned: schema.user.banned,
			createdAt: schema.user.createdAt
		})
		.from(schema.user)
		.orderBy(asc(schema.user.email))
		.limit(limit);
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
	return db().select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(limit);
}

export async function listSettings() {
	return db().select().from(schema.appSettings).orderBy(asc(schema.appSettings.key));
}

export async function setSetting(key: string, value: string): Promise<void> {
	await db()
		.insert(schema.appSettings)
		.values({ key, value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: schema.appSettings.key,
			set: { value, updatedAt: new Date() }
		});
}
