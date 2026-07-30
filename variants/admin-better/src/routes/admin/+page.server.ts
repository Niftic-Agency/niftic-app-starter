import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { requireRole } from '$lib/server/auth/permissions';
import { audit } from '$lib/server/admin/audit';
import { listUsers } from '$lib/server/db/repos/admin';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

/**
 * User management.
 *
 * Mutations go through Better Auth's admin plugin rather than writing the table
 * directly: banning also has to revoke the user's live sessions, and a direct
 * UPDATE would leave them signed in until their token expired.
 */

const targetSchema = z.object({ userId: z.string().min(1) });
const roleSchema = targetSchema.extend({ role: z.enum(['admin', 'user']) });

export const load: PageServerLoad = async (event) => {
	requireRole(event, 'admin');
	return { users: await listUsers() };
};

export const actions: Actions = {
	setRole: async (event) => {
		const actor = requireRole(event, 'admin');

		const parsed = roleSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		// An admin removing their own admin role locks everyone out of /admin if
		// they are the last one. Refuse rather than let them do it by accident.
		if (parsed.data.userId === actor.id && parsed.data.role !== 'admin') {
			return fail(400, { error: "You can't remove your own admin role." });
		}

		try {
			await auth().api.setRole({
				body: { userId: parsed.data.userId, role: parsed.data.role },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError) return fail(400, { error: 'That change was rejected.' });
			throw error;
		}

		await audit({
			actor,
			action: 'user.role_changed',
			targetType: 'user',
			targetId: parsed.data.userId,
			detail: { role: parsed.data.role }
		});

		return { success: true };
	},

	setBanned: async (event) => {
		const actor = requireRole(event, 'admin');

		const form = Object.fromEntries(await event.request.formData());
		const parsed = targetSchema.safeParse(form);
		if (!parsed.success) return fail(400, { error: 'Invalid request.' });

		const banning = form.banned === 'true';

		if (parsed.data.userId === actor.id) {
			return fail(400, { error: "You can't ban yourself." });
		}

		try {
			if (banning) {
				await auth().api.banUser({
					body: { userId: parsed.data.userId },
					headers: event.request.headers
				});
			} else {
				await auth().api.unbanUser({
					body: { userId: parsed.data.userId },
					headers: event.request.headers
				});
			}
		} catch (error) {
			if (error instanceof APIError) {
				logger.warn('admin.ban_rejected', { requestId: event.locals.requestId });
				return fail(400, { error: 'That change was rejected.' });
			}
			throw error;
		}

		await audit({
			actor,
			action: banning ? 'user.banned' : 'user.unbanned',
			targetType: 'user',
			targetId: parsed.data.userId
		});

		return { success: true };
	}
};
