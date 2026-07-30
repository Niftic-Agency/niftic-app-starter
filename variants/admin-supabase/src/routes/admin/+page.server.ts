import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireRole } from '$lib/server/auth/permissions';
import { audit } from '$lib/server/admin/audit';
import { supabaseAdmin } from '$lib/server/admin/service-client';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

/**
 * User management, reduced to what this branch actually has: roles.
 *
 * Reads and writes go through the SERVICE-ROLE client, which is the honest
 * answer rather than a shortcut — listing every profile is precisely the
 * operation RLS is built to prevent, and `profiles` deliberately has no policy
 * that would allow it. The escalation is contained: this file is inside
 * `$lib/server/admin/`, which is the only place ESLint permits the import, and
 * `requireRole` runs first in the load AND in every action.
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

	const { data, error } = await supabaseAdmin()
		.from('profiles')
		.select('user_id, email, display_name, role, created_at')
		.order('email');

	if (error) {
		logger.error('admin.list_failed', { requestId: event.locals.requestId });
		return { profiles: [] };
	}

	return { profiles: data };
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

		const { error } = await supabaseAdmin()
			.from('profiles')
			.update({ role: parsed.data.role, updated_at: new Date().toISOString() })
			.eq('user_id', parsed.data.userId);

		if (error) {
			logger.error('admin.set_role_failed', { requestId: event.locals.requestId });
			return fail(500, { error: 'That change was rejected.' });
		}

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
