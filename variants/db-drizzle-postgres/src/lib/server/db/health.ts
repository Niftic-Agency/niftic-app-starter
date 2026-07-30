import { sql } from 'drizzle-orm';
import type { HealthCheck } from '$lib/server/health';
import { db } from './index';

/**
 * Cheapest possible round trip that proves the connection works. Deliberately
 * not a table read: a health check must not depend on migrations having run.
 *
 * `execute` rather than the libSQL branch's `run` — the postgres-js driver has
 * no `run`. This is the one place the two Drizzle branches differ outside their
 * schema files.
 */
export const databaseCheck: HealthCheck = {
	name: 'database',
	async run() {
		await db().execute(sql`select 1`);
	}
};
