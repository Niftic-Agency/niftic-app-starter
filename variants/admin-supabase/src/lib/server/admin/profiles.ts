import { supabaseAdmin } from './service-client';
import { logger } from '$lib/server/logger';

/**
 * The privileged reads and writes the admin screens need, kept inside the one
 * directory allowed to bypass row level security.
 *
 * The routes call these instead of holding the service-role client themselves.
 * That is the difference between "the escalation is in two files" and "the
 * escalation is wherever someone last needed it": every query that skips RLS on
 * this branch is in this directory, and ESLint keeps it that way.
 *
 * Listing every profile is precisely the operation RLS exists to prevent, and
 * `profiles` deliberately has no policy that would allow it — so this is the
 * honest place for it rather than a shortcut around a missing policy.
 */

export interface AdminProfile {
	user_id: string;
	email: string | null;
	display_name: string | null;
	role: string | null;
	created_at: string;
}

/** Every profile, ordered by email. Returns [] and logs rather than throwing. */
export async function listProfiles(requestId: string): Promise<AdminProfile[]> {
	const { data, error } = await supabaseAdmin()
		.from('profiles')
		.select('user_id, email, display_name, role, created_at')
		.order('email');

	if (error) {
		logger.error('admin.list_failed', { requestId, error: error.message });
		return [];
	}

	return data ?? [];
}

/** True when the change was applied. The caller decides what to tell the user. */
export async function setProfileRole(
	userId: string,
	role: 'admin' | 'member',
	requestId: string
): Promise<boolean> {
	const { error } = await supabaseAdmin()
		.from('profiles')
		.update({ role, updated_at: new Date().toISOString() })
		.eq('user_id', userId);

	if (error) {
		logger.error('admin.set_role_failed', { requestId, error: error.message });
		return false;
	}

	return true;
}
