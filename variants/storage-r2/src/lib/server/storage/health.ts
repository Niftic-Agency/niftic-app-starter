import { env } from '$lib/server/env';
import type { HealthCheck } from '$lib/server/health';

/**
 * Configuration presence only. A real round trip to R2 on every health poll
 * would cost money and rate limit, and would make the endpoint fail whenever
 * Cloudflare has a bad minute — which is not what "is this app healthy" means.
 */
export const storageCheck: HealthCheck = {
	name: 'storage',
	async run() {
		const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env();
		for (const [name, value] of Object.entries({
			R2_ACCOUNT_ID,
			R2_ACCESS_KEY_ID,
			R2_SECRET_ACCESS_KEY,
			R2_BUCKET
		})) {
			if (!value) throw new Error(`${name} is not set`);
		}
		return { note: `bucket ${R2_BUCKET}` };
	}
};
