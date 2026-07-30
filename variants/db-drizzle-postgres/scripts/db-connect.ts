import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// A relative import into src, which tsx resolves happily — `connection.ts` is
// pure and carries no `$lib` imports, precisely so it can be shared like this.
import { isLoopback } from '../src/lib/server/db/connection';
import * as schema from '../src/lib/server/db/schema/index';

/**
 * One database connection for the scripts that run outside SvelteKit.
 *
 * `migrate` and `seed` run under plain tsx, where `$lib` and `$app/server` do
 * not resolve, so they cannot use `src/lib/server/db`. This is the seam that
 * keeps them from each hand-rolling a client — and, more importantly, the seam
 * that lets `seed.ts` be written once for every Drizzle branch instead of once
 * per dialect. Each db variant ships its own copy of this file; only one is ever
 * copied into an app.
 *
 * Deliberately NOT going through `connectionOptions`: that enforces the pooling
 * rules for the running app, and these scripts are also how you migrate a
 * database from a laptop before a pooler exists in front of it.
 */

export interface DbConnection {
	db: ReturnType<typeof create>;
	/** Safe to log — credentials removed. */
	label: string;
	close(): Promise<void>;
}

function create(client: postgres.Sql) {
	return drizzle(client, { schema });
}

export function connect(): DbConnection {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL is required. Set it and re-run.');
		process.exit(1);
	}

	let local = false;
	try {
		local = isLoopback(new URL(url).hostname);
	} catch {
		console.error('DATABASE_URL is not a valid connection URL.');
		process.exit(1);
	}

	// One connection: these scripts are sequential, and a migration holding a
	// pool open is a good way to deadlock against its own DDL.
	const client = postgres(url, { max: 1, prepare: false, ssl: local ? false : 'require' });

	return {
		db: create(client),
		label: url.replace(/\/\/.*@/, '//***@'),
		close: () => client.end()
	};
}
