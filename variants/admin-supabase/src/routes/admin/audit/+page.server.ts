import { requireRole } from '$lib/server/auth/permissions';
import { recentAuditEntries } from '$lib/server/admin/audit';
import type { PageServerLoad } from './$types';

/** Read-only. The log is written by `audit()` and never edited. */
export const load: PageServerLoad = async (event) => {
	await requireRole(event, 'admin');

	return { entries: await recentAuditEntries() };
};
