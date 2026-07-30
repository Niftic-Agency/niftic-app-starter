import { requireRole } from '$lib/server/auth/permissions';
import type { LayoutServerLoad } from './$types';

/**
 * Guards every admin route. requireRole 404s rather than 403s — telling an
 * unauthorized caller that /admin exists is information they hadn't earned.
 *
 * As everywhere else, this protects what is SHOWN; each action re-checks.
 */
export const load: LayoutServerLoad = async (event) => {
	const user = requireRole(event, 'admin');
	return { admin: { id: user.id, email: user.email } };
};
