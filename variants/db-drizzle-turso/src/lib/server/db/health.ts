import { sql } from 'drizzle-orm';
import type { HealthCheck } from '$lib/server/health';
import { db } from './index';

/**
 * Cheapest possible round trip that proves the connection works. Deliberately
 * not a table read: a health check must not depend on migrations having run.
 */
export const databaseCheck: HealthCheck = {
	name: 'database',
	async run() {
		await db().run(sql`select 1`);
	}
};
