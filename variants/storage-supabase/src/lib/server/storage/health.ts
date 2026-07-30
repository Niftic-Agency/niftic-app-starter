import { getRequestEvent } from '$app/server';
import type { HealthCheck } from '$lib/server/health';
import { supabase } from '$lib/server/supabase';

/**
 * Proves the bucket exists and is reachable. Deliberately not an upload — a
 * health check must be cheap and must never mutate.
 */
export const storageCheck: HealthCheck = {
	name: 'storage',
	async run() {
		const { error } = await supabase(getRequestEvent()).storage.from('assets').list('', {
			limit: 1
		});
		if (error) throw error;

		return { note: 'bucket assets (private)' };
	}
};
