import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { requireUser } from '$lib/server/auth/permissions';
import { requireOrgRole } from '$lib/server/orgs/permissions';
import { findActiveOrganizationId } from '$lib/server/db/repos/organizations';
import { organizationSchema } from '$lib/orgs/schema';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The organization picker: what you belong to, what you have been invited to,
 * and how to start a new one.
 *
 * Every mutation here ends in a redirect, unlike the notes routes which stay put
 * — these rewrite the session, and re-POSTing a switch on a page refresh is not
 * something anyone means to do.
 */

const targetSchema = z.object({ organizationId: z.string().min(1) });

export const load: PageServerLoad = async (event) => {
	requireUser(event);
	const headers = event.request.headers;

	return {
		organizations: await auth().api.listOrganizations({ headers }),
		invitations: await listMyInvitations(event),
		// From the session ROW, not from `locals`: the cached session cookie lags a
		// switch. See the note in $lib/server/db/repos/organizations.
		activeOrganizationId: event.locals.session
			? await findActiveOrganizationId(event.locals.session.token)
			: null,
		form: await superValidate(zod4(organizationSchema))
	};
};

/**
 * Pending invitations addressed to the signed-in user.
 *
 * Degrades to an empty list rather than taking the page down: this endpoint
 * refuses an unverified session address, which is a state a user can legitimately
 * be in, and it is not worth a 500 on the organization list.
 */
async function listMyInvitations(event: RequestEvent) {
	try {
		return await auth().api.listUserInvitations({ headers: event.request.headers });
	} catch (err) {
		if (err instanceof APIError) {
			logger.warn('orgs.list_invitations_rejected', { requestId: event.locals.requestId });
			return [];
		}
		throw err;
	}
}

export const actions: Actions = {
	create: async (event) => {
		requireUser(event);

		const form = await superValidate(event.request, zod4(organizationSchema));
		if (!form.valid) return fail(400, { form });

		try {
			// The creator becomes `owner` and the new organization becomes active —
			// both are the plugin's doing, not ours.
			await auth().api.createOrganization({
				body: { name: form.data.name, slug: form.data.slug },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				// The slug is unique across the install, so a collision is a normal
				// outcome of a normal form and belongs on the field.
				return fail(400, {
					form: setError(form, 'slug', 'That address is already taken. Try another.')
				});
			}
			throw err;
		}

		redirect(303, '/organizations/members');
	},

	setActive: async (event) => {
		const parsed = targetSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		// The id came out of a form field, so membership is re-derived rather than
		// assumed. Better Auth checks too; this is the check that decides what the
		// caller is told, and it answers a wrong id and someone else's id alike.
		await requireOrgRole(event, parsed.data.organizationId);

		await auth().api.setActiveOrganization({
			body: { organizationId: parsed.data.organizationId },
			headers: event.request.headers
		});

		redirect(303, '/organizations/members');
	},

	leave: async (event) => {
		const parsed = targetSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		await requireOrgRole(event, parsed.data.organizationId);

		try {
			// Refused for the last owner — an organization nobody can administer is
			// worse than one you are still in.
			await auth().api.leaveOrganization({
				body: { organizationId: parsed.data.organizationId },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, {
					error: "You're the only owner. Make someone else an owner first."
				});
			}
			throw err;
		}

		redirect(303, '/organizations');
	}
};
