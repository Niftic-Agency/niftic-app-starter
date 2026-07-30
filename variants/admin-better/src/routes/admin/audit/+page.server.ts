import { requireRole } from '$lib/server/auth/permissions';
import { listAudit } from '$lib/server/db/repos/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireRole(event, 'admin');
	return { entries: await listAudit() };
};
