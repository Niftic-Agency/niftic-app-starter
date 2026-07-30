import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/permissions';
import { hasOrgRole, type OrgRole } from '$lib/orgs/roles';
import {
	findActiveMembership,
	findActiveOrganizationId,
	findMembership,
	type Membership
} from '$lib/server/db/repos/organizations';

/**
 * The second authorization axis.
 *
 * `requireRole` answers "what may this person do to the application"; this file
 * answers "what may this person do inside THIS organization". Both get checked,
 * and both get checked in the action as well as in the load — a form action can
 * be POSTed directly without any layout or load ever running, so a guard that
 * only runs in `load` protects the page and nothing else.
 *
 * There is deliberately no `handle` hook resolving org context globally. It
 * would cost a query on every request, including the many that never look at an
 * organization, and it would move the check away from the code that depends on
 * it. The guards below cost one query each, at the point of use.
 */

/** The session token, which every read here is keyed by. */
function tokenOf(event: RequestEvent): string {
	requireUser(event);

	// `requireUser` redirected if there were no user, and the hook sets both
	// fields together, so a user without a session is not a state that exists.
	const token = event.locals.session?.token;
	if (!token) redirect(303, '/login');

	return token;
}

/**
 * The organization the session is pointed at, or a redirect to go pick one.
 *
 * Read from the session ROW, not from `locals` — see the note in
 * `$lib/server/db/repos/organizations`. Read from the session rather than a form
 * field, because a form field is the caller's to choose; where an organization
 * id genuinely does arrive in a payload, it goes through `requireOrgRole`.
 */
export async function activeOrganizationId(event: RequestEvent): Promise<string> {
	const organizationId = await findActiveOrganizationId(tokenOf(event));
	if (!organizationId) redirect(303, '/organizations');

	return organizationId;
}

/**
 * Membership in a named organization, at or above `required`.
 *
 * 404 rather than 403, for the same reason `requireRole` does it: telling
 * someone an organization exists, and that they merely lack the role for it, is
 * information they did not have. A non-member and a wrong id are answered
 * identically.
 */
export async function requireOrgRole(
	event: RequestEvent,
	organizationId: string,
	required: OrgRole = 'member'
): Promise<Membership> {
	const user = requireUser(event);

	const membership = await findMembership(user.id, organizationId);
	if (!membership || !hasOrgRole(membership.role, required)) error(404, 'Not found');

	return membership;
}

/**
 * The common case: the active organization, at or above `required`.
 *
 * An empty result sends the caller to the picker rather than to a 404, and the
 * two ways it can be empty are treated the same on purpose. One is "you haven't
 * chosen an organization yet". The other is "you were removed from the one you
 * had chosen" — Better Auth's `removeMember` leaves `active_organization_id`
 * pointing at it. Neither reveals anything the caller's own session did not
 * already contain, and both have the same remedy.
 *
 * Being under-privileged inside an organization you ARE in is different, and
 * still answers 404.
 */
export async function requireActiveOrgRole(
	event: RequestEvent,
	required: OrgRole = 'member'
): Promise<Membership> {
	const membership = await findActiveMembership(tokenOf(event));
	if (!membership) redirect(303, '/organizations');
	if (!hasOrgRole(membership.role, required)) error(404, 'Not found');

	return membership;
}
