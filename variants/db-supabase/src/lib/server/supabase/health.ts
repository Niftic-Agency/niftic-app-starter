import { getRequestEvent } from '$app/server';
import type { HealthCheck } from '$lib/server/health';
import { hasSecretKey, supabase } from './index';

/**
 * Cheapest round trip that proves the project is reachable and the publishable
 * key is accepted.
 *
 * Deliberately a table-free call: a health check must not depend on migrations
 * having run, and on this branch it must not depend on a policy either — a
 * `select` against a real table would report "degraded" for a perfectly healthy
 * project that simply does not let an anonymous caller read that table.
 */
export const databaseCheck: HealthCheck = {
	name: 'database',
	async run() {
		const { error } = await supabase(getRequestEvent()).auth.getSession();
		if (error) throw error;

		return {
			note: hasSecretKey()
				? 'project reachable; secret key configured'
				: 'project reachable; no secret key — admin operations will fail'
		};
	}
};
