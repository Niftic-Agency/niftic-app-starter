import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { supabase } from '$lib/server/supabase';

/**
 * Authorization helpers.
 *
 * Call these in every load AND in every action. A guard in `+layout.server.ts`
 * protects what the user is shown; it does not protect the endpoint, because a
 * form action can be POSTed directly. Re-checking in the action is the check
 * that actually matters.
 *
 * The role comes from the `profiles` table, read through the USER-scoped client
 * — so the read is itself subject to the policy that lets you see only your own
 * profile. It deliberately does not come from a JWT claim: a claim is whatever
 * the token says, and the token is minted from data the user can influence
 * through sign-up metadata. `profiles.role` has no insert or update policy at
 * all, so nothing holding a publishable key can write it.
 */

export type Role = 'admin' | 'member';

export interface AuthUser {
	id: string;
	email: string;
	displayName: string | null;
}

/** Throws a redirect to sign-in when there is no session. */
export function requireUser(event: RequestEvent): AuthUser {
	if (!event.locals.user) {
		const target = event.url.pathname + event.url.search;
		redirect(303, `/login?redirectTo=${encodeURIComponent(target)}`);
	}
	return event.locals.user;
}

export function roleOf(role: string | null | undefined): Role {
	return role === 'admin' ? 'admin' : 'member';
}

export function hasRole(role: string | null | undefined, required: Role): boolean {
	// Admins pass every member-level check; members do not pass admin checks.
	return required === 'member' ? true : roleOf(role) === 'admin';
}

/** The caller's own role, read through their own client and their own policy. */
export async function roleFor(event: RequestEvent): Promise<Role> {
	const user = requireUser(event);

	const { data } = await supabase(event)
		.from('profiles')
		.select('role')
		.eq('user_id', user.id)
		.maybeSingle();

	return roleOf(data?.role);
}

/**
 * 404 rather than 403 for an admin route: telling an unauthorized user that a
 * page exists is information they didn't have.
 */
export async function requireRole(event: RequestEvent, required: Role): Promise<AuthUser> {
	const user = requireUser(event);
	if (!hasRole(await roleFor(event), required)) error(404, 'Not found');
	return user;
}
