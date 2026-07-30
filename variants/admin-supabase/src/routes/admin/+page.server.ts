import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireRole } from '$lib/server/auth/permissions';
import { audit } from '$lib/server/admin/audit';
import { listProfiles, setProfileRole } from '$lib/server/admin/profiles';
import type { Actions, PageServerLoad } from './$types';

/**
 * User management, reduced to what this branch actually has: roles.
 *
 * The privileged queries live in `$lib/server/admin/profiles`, not here. This
 * route may not import the service-role client at all — ESLint refuses it, and
 * that refusal is what keeps every RLS bypass on this branch inside one
 * directory instead of wherever a screen last needed one. What this file owns is
 * authorization: `requireRole` runs first in the load AND in every action.
 *
 * There is no ban here, unlike the Better Auth branch. Supabase owns the account
 * lifecycle; banning is `auth.admin.updateUserById` with a ban duration, and it
 * is left out of v1 rather than half-built.
 */

const roleSchema = z.object({
	userId: z.string().uuid(),
	role: z.enum(['admin', 'member'])
});

export const load: PageServerLoad = async (event) => {
	await requireRole(event, 'admin');

	return { profiles: await listProfiles(event.locals.requestId) };
};

export const actions: Actions = {
	setRole: async (event) => {
		const actor = await requireRole(event, 'admin');

		const parsed = roleSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		// An admin removing their own admin role locks everyone out of /admin if
		// they are the last one. Refuse rather than let it happen by accident.
		if (parsed.data.userId === actor.id && parsed.data.role !== 'admin') {
			return fail(400, { error: "You can't remove your own admin role." });
		}

		const applied = await setProfileRole(
			parsed.data.userId,
			parsed.data.role,
			event.locals.requestId
		);
		if (!applied) return fail(500, { error: 'That change was rejected.' });

		await audit({
			actor: { id: actor.id, email: actor.email },
			action: 'user.role_changed',
			targetType: 'user',
			targetId: parsed.data.userId,
			detail: { role: parsed.data.role }
		});

		return { success: true };
	}
};
