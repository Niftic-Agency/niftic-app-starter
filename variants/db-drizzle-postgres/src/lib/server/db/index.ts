import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { appConfig } from '$lib/app-config';
import { env } from '$lib/server/env';
import { connectionOptions } from './connection';
import * as schema from './schema';

/**
 * postgres-js through Drizzle.
 *
 * `DATABASE_URL` is always the POOLED endpoint. From Vercel that is not a
 * preference: each function instance opens its own client, so a few hundred
 * concurrent invocations against a bare Postgres exhausts `max_connections` and
 * the site stops. `connectionOptions` refuses to boot on a connection string
 * shaped like a direct one — see docs/postgres-pooling.md for what transaction
 * pooling then rules out (session `SET`, `LISTEN`/`NOTIFY`, long advisory locks).
 *
 * Keep application SQL SQLite-compatible where you can. The lite→postgres
 * graduation path is only mechanical while it stays that way.
 */
function createDb() {
	const { DATABASE_URL } = env();

	const client = postgres(DATABASE_URL, connectionOptions(DATABASE_URL, appConfig.host));

	return drizzle(client, { schema });
}

// Lazy so importing this module never forces env validation at build time — and
// so the connection-string assertion fires on first real use rather than during
// `vite build`, where there is no reason for a database URL to exist yet.
let instance: ReturnType<typeof createDb> | undefined;

export function db(): ReturnType<typeof createDb> {
	instance ??= createDb();
	return instance;
}

export { schema };
