import { createClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { publicEnv } from '$lib/supabase-config';
import type { Database } from '$lib/database.types';

/**
 * The SERVICE-ROLE client. It bypasses row level security completely.
 *
 * It lives under `$lib/server/admin/` and ESLint refuses this module to anything
 * outside that directory — a rule that was documented here for a while before it
 * existed, which is exactly how a boundary rots. Sibling modules wrap it and are
 * called by name; the client itself never leaves.
 *
 * That restriction is the point: on this branch RLS is the authorization layer,
 * so a query that skips it has skipped authorization, and the set of places
 * allowed to do that should be small enough to read in one sitting.
 *
 * Before reaching for this, check that the user-scoped client really cannot do
 * the job. It usually can — and when it cannot, the honest fix is often a policy
 * rather than an escalation.
 *
 * Legitimate uses, all of them here:
 *   - writing a row the owner must not be able to forge (a role)
 *   - reading across every user for an admin screen
 *   - creating the storage bucket at seed time
 */
let instance: ReturnType<typeof create> | undefined;

function create() {
	const { SUPABASE_SECRET_KEY } = env();

	if (!SUPABASE_SECRET_KEY) {
		throw new Error(
			'SUPABASE_SECRET_KEY is required for admin operations. It must never be set in a browser-visible variable.'
		);
	}

	return createClient<Database>(publicEnv.url, SUPABASE_SECRET_KEY, {
		auth: {
			// No session to persist and nothing to refresh: this client is not a
			// user, and leaving these on would have it writing tokens to storage on
			// a server.
			persistSession: false,
			autoRefreshToken: false
		}
	});
}

export function supabaseAdmin(): ReturnType<typeof create> {
	instance ??= create();
	return instance;
}
