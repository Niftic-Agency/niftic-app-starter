import { requireRole } from '$lib/server/auth/permissions';
import { supabaseAdmin } from '$lib/server/admin/service-client';
import type { PageServerLoad } from './$types';

/** Read-only. The log is written by `audit()` and never edited. */
export const load: PageServerLoad = async (event) => {
	await requireRole(event, 'admin');

	const { data } = await supabaseAdmin()
		.from('audit_log')
		.select('id, actor_email, action, target_type, target_id, created_at')
		.order('created_at', { ascending: false })
		.limit(100);

	return { entries: data ?? [] };
};
