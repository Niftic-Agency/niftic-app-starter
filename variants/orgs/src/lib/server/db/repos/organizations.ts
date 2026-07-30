import { and, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

/**
 * Read-side queries for organizations.
 *
 * Mutations deliberately do NOT live here. Creating an organization, inviting,
 * accepting, changing a role and removing a member all go through Better Auth's
 * organization plugin, for the same reason `/admin` goes through the admin
 * plugin: the plugin maintains invariants a direct table write would skip —
 * slug uniqueness, invitation status transitions, the creator's owner row, and
 * clearing `session.active_organization_id` when someone leaves.
 *
 * Everything here reads the session ROW rather than `locals.session`, and that
 * is load-bearing rather than fussy. `session.cookieCache` serves the session
 * from a signed cookie, and the plugin's `setActiveOrganization` writes the row
 * through `internalAdapter.updateSession`, which does not refresh that cookie.
 * So `locals.session.activeOrganizationId` can name the PREVIOUS organization
 * for up to `cookieCache.maxAge` after a switch — long enough that creating an
 * organization bounces you straight back to the picker. Found by running it.
 *
 * The token is fine to read from `locals`: the cached copy and the row share it.
 */

export interface Membership {
	id: string;
	role: string;
	organizationId: string;
}

/** The organization this session currently points at, read from the row. */
export async function findActiveOrganizationId(sessionToken: string): Promise<string | null> {
	const rows = await db()
		.select({ organizationId: schema.session.activeOrganizationId })
		.from(schema.session)
		.where(eq(schema.session.token, sessionToken))
		.limit(1);

	return rows[0]?.organizationId ?? null;
}

/**
 * The caller's membership in the organization their session points at.
 *
 * One query, joined on the session row, so the active organization and the
 * membership in it can never disagree — and so the two ways it can come back
 * empty are indistinguishable to the caller: no active organization at all, and
 * an active organization they are no longer a member of. Both mean "go pick
 * one", which is exactly what the caller does with an empty result.
 *
 * Keyed by session token alone. Taking a user id as well would let a caller pass
 * one that doesn't match the session.
 */
export async function findActiveMembership(sessionToken: string): Promise<Membership | undefined> {
	const rows = await db()
		.select({
			id: schema.member.id,
			role: schema.member.role,
			organizationId: schema.member.organizationId
		})
		.from(schema.session)
		.innerJoin(
			schema.member,
			and(
				eq(schema.member.organizationId, schema.session.activeOrganizationId),
				eq(schema.member.userId, schema.session.userId)
			)
		)
		.where(eq(schema.session.token, sessionToken))
		.limit(1);

	return rows[0];
}

/**
 * The caller's membership in one NAMED organization, or undefined.
 *
 * Both ids are required arguments rather than optional filters. A lookup that
 * can be called without a user id will eventually be called without one, and on
 * this table that is a cross-tenant read.
 */
export async function findMembership(
	userId: string,
	organizationId: string
): Promise<Membership | undefined> {
	const rows = await db()
		.select({
			id: schema.member.id,
			role: schema.member.role,
			organizationId: schema.member.organizationId
		})
		.from(schema.member)
		.where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)))
		.limit(1);

	return rows[0];
}
