import { requireUser, roleFor } from '$lib/server/auth/permissions';
import type { LayoutServerLoad } from './$types';

/**
 * Guards every route in the (app) group.
 *
 * This protects what a user is SHOWN. It does not protect endpoints — a form
 * action can be POSTed directly without ever loading a layout — so every action
 * re-checks with requireUser/requireRole. Both, always.
 */
export const load: LayoutServerLoad = async (event) => {
	const user = requireUser(event);

	return {
		user: {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			role: await roleFor(event)
		}
	};
};
