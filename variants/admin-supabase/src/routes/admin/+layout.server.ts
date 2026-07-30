import { requireRole } from '$lib/server/auth/permissions';
import type { LayoutServerLoad } from './$types';

/**
 * Guards every /admin route. Not sufficient on its own — each action re-checks,
 * because a form action can be POSTed without a layout ever loading.
 */
export const load: LayoutServerLoad = async (event) => {
	const user = await requireRole(event, 'admin');
	return { user: { id: user.id, email: user.email } };
};
