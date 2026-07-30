import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { AuthUser } from './index';

/**
 * Authorization helpers.
 *
 * Call these in every load AND in every action. A guard in `+layout.server.ts`
 * protects what the user is shown; it does not protect the endpoint, because a
 * form action can be POSTed directly. Re-checking in the action is the check
 * that actually matters.
 */

export type Role = 'admin' | 'user';

/** Throws a redirect to sign-in when there is no session. */
export function requireUser(event: RequestEvent): AuthUser {
	if (!event.locals.user) {
		const target = event.url.pathname + event.url.search;
		redirect(303, `/login?redirectTo=${encodeURIComponent(target)}`);
	}
	return event.locals.user;
}

export function roleOf(user: { role?: string | null }): Role {
	return user.role === 'admin' ? 'admin' : 'user';
}

export function hasRole(user: { role?: string | null }, role: Role): boolean {
	// Admins pass every user-level check; plain users do not pass admin checks.
	return role === 'user' ? true : roleOf(user) === 'admin';
}

/**
 * 404 rather than 403 for an admin route: telling an unauthorized user that a
 * page exists is information they didn't have.
 */
export function requireRole(event: RequestEvent, role: Role): AuthUser {
	const user = requireUser(event);
	if (!hasRole(user, role)) error(404, 'Not found');
	return user;
}

export function isBanned(user: { banned?: boolean | null; banExpires?: Date | null }): boolean {
	if (!user.banned) return false;
	if (!user.banExpires) return true;
	return user.banExpires.getTime() > Date.now();
}
