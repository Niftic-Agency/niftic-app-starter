import { error, fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { requireUser } from '$lib/server/auth/permissions';
import { orgRoleOf } from '$lib/orgs/roles';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

/**
 * The other end of the invitation email.
 *
 * The link points here, and this route lives inside the `(app)` group, so an
 * invitee who is signed out is bounced to `/login?redirectTo=…` and lands back
 * on this page afterwards. Someone with no account at all signs up first — in
 * `client` mode from the link on the login page, in `internal` mode by signing
 * in with a permitted Google account.
 *
 * Authorization is entirely Better Auth's here, and it is the one place in this
 * variant where that is the right answer: the invitation, not a membership, is
 * the credential. It refuses any session whose email is not the invited address,
 * and — because `requireEmailVerificationOnInvitation` is on — any session whose
 * address is unverified. Every rejection is answered as a 404: whether an
 * invitation id exists is not something a stranger gets to learn.
 */

export const load: PageServerLoad = async (event) => {
	requireUser(event);

	try {
		const invitation = await auth().api.getInvitation({
			query: { id: event.params.id },
			headers: event.request.headers
		});

		return {
			invitation: {
				id: invitation.id,
				email: invitation.email,
				role: orgRoleOf(invitation.role),
				organizationName: invitation.organizationName,
				inviterEmail: invitation.inviterEmail,
				expiresAt: invitation.expiresAt
			}
		};
	} catch (err) {
		if (err instanceof APIError) {
			logger.warn('orgs.invitation_not_available', { requestId: event.locals.requestId });
			error(404, 'Not found');
		}
		throw err;
	}
};

export const actions: Actions = {
	accept: async (event) => {
		requireUser(event);

		try {
			// Flips the invitation pending → accepted and creates the membership in
			// one transaction, so a double submit cannot produce two memberships.
			await auth().api.acceptInvitation({
				body: { invitationId: event.params.id },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { error: 'That invitation is no longer valid.' });
			}
			throw err;
		}

		// Accepting makes the organization active, and the session that says so was
		// read before this action ran — so redirect rather than re-render.
		redirect(303, '/organizations/members');
	},

	reject: async (event) => {
		requireUser(event);

		try {
			await auth().api.rejectInvitation({
				body: { invitationId: event.params.id },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { error: 'That invitation is no longer valid.' });
			}
			throw err;
		}

		redirect(303, '/organizations');
	}
};
