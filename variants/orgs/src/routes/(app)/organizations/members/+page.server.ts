import { error, fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import {
	canRemoveMember,
	canSetRole,
	hasOrgRole,
	orgRoleOf,
	MANAGEABLE_ROLES
} from '$lib/orgs/roles';
import { inviteSchema } from '$lib/orgs/schema';
import { requireActiveOrgRole } from '$lib/server/orgs/permissions';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The active organization's members and pending invitations.
 *
 * This page is the second authorization axis in one screen, so every handler
 * opens the same way: resolve the organization from the SESSION, re-check the
 * caller's membership against the database, then act. No handler takes an
 * organization id from the payload. Member and invitation ids do arrive in form
 * fields, and each is re-scoped to the caller's own organization before use —
 * both tables hold every tenant's rows, so an id alone proves nothing.
 */

const memberSchema = z.object({ memberId: z.string().min(1) });
const roleSchema = memberSchema.extend({ role: z.enum(MANAGEABLE_ROLES) });
const invitationSchema = z.object({ invitationId: z.string().min(1) });

export const load: PageServerLoad = async (event) => {
	const membership = await requireActiveOrgRole(event);
	const role = orgRoleOf(membership.role);
	const manages = hasOrgRole(role, 'admin');

	const organization = await fullOrganization(event, membership.organizationId);

	return {
		organization: {
			id: organization.id,
			name: organization.name,
			slug: organization.slug
		},
		members: organization.members.map((m) => ({
			id: m.id,
			role: orgRoleOf(m.role),
			name: m.user.name,
			email: m.user.email
		})),
		/**
		 * Withheld from plain members on purpose. `getFullOrganization` hands every
		 * invitation — id included — to anyone who can see the organization, and an
		 * invitation id is exactly what accept, reject and cancel take. Only the
		 * people who can act on them get to see them.
		 */
		invitations: manages
			? organization.invitations
					.filter((invite) => invite.status === 'pending')
					.map((invite) => ({
						id: invite.id,
						email: invite.email,
						role: orgRoleOf(invite.role),
						expiresAt: invite.expiresAt
					}))
			: [],
		viewer: { memberId: membership.id, role },
		form: await superValidate(zod4(inviteSchema))
	};
};

export const actions: Actions = {
	invite: async (event) => {
		const membership = await requireActiveOrgRole(event, 'admin');

		const form = await superValidate(event.request, zod4(inviteSchema));
		if (!form.valid) return fail(400, { form });

		try {
			// Sends the invitation through sendEmail() — the plugin config lives in
			// $lib/server/auth/plugins.ts. Refused when the address already belongs
			// to a member, which is why there is no duplicate check here.
			await auth().api.createInvitation({
				body: {
					email: form.data.email,
					role: form.data.role,
					organizationId: membership.organizationId
				},
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				logger.warn('orgs.invite_rejected', { requestId: event.locals.requestId });
				return fail(400, {
					form: setError(form, 'email', 'That address is already a member or already invited.')
				});
			}
			throw err;
		}

		return { form };
	},

	cancelInvite: async (event) => {
		const membership = await requireActiveOrgRole(event, 'admin');

		const parsed = invitationSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		// Scoped through the organization the caller was already authorized for, so
		// an invitation belonging to another tenant answers the same as one that
		// never existed.
		//
		// Note this cannot go through `auth.api.getInvitation`: that endpoint is for
		// the RECIPIENT and refuses any session whose email is not the invited
		// address — which is every admin who ever sent one.
		const organization = await fullOrganization(event, membership.organizationId);
		const invitation = organization.invitations.find((i) => i.id === parsed.data.invitationId);
		if (!invitation || invitation.status !== 'pending') error(404, 'Not found');

		await auth().api.cancelInvitation({
			body: { invitationId: invitation.id },
			headers: event.request.headers
		});

		return { success: true };
	},

	setRole: async (event) => {
		const membership = await requireActiveOrgRole(event, 'admin');

		const parsed = roleSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		const organization = await fullOrganization(event, membership.organizationId);
		const target = memberIn(organization, parsed.data.memberId);

		// Demoting yourself out of the last owner slot leaves an organization
		// nobody can administer. Refuse rather than allow it by accident.
		if (target.id === membership.id) {
			return fail(400, { error: "You can't change your own role." });
		}

		if (!canSetRole(orgRoleOf(membership.role), target.role, parsed.data.role)) {
			return fail(403, { error: 'That change is above your role.' });
		}

		await auth().api.updateMemberRole({
			body: {
				memberId: target.id,
				role: parsed.data.role,
				organizationId: membership.organizationId
			},
			headers: event.request.headers
		});

		return { success: true };
	},

	remove: async (event) => {
		const membership = await requireActiveOrgRole(event, 'admin');

		const parsed = memberSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		const organization = await fullOrganization(event, membership.organizationId);
		const target = memberIn(organization, parsed.data.memberId);

		if (target.id === membership.id) {
			return fail(400, { error: 'Use Leave on the organizations page to remove yourself.' });
		}

		if (!canRemoveMember(orgRoleOf(membership.role), target.role)) {
			return fail(403, { error: 'That member is above your role.' });
		}

		await auth().api.removeMember({
			body: { memberIdOrEmail: target.id, organizationId: membership.organizationId },
			headers: event.request.headers
		});

		return { success: true };
	}
};

/** The caller's organization, members and invitations in one round trip. */
async function fullOrganization(event: RequestEvent, organizationId: string) {
	const organization = await auth().api.getFullOrganization({
		query: { organizationId },
		headers: event.request.headers
	});

	// The caller's membership row exists, so this is only ever null if the
	// organization was deleted between the two queries.
	if (!organization) error(404, 'Not found');

	return organization;
}

/** A member id from a form field, re-scoped to an organization already authorized. */
function memberIn(
	organization: { members: { id: string; role: string }[] },
	memberId: string
): { id: string; role: ReturnType<typeof orgRoleOf> } {
	const found = organization.members.find((m) => m.id === memberId);
	if (!found) error(404, 'Not found');

	return { id: found.id, role: orgRoleOf(found.role) };
}
