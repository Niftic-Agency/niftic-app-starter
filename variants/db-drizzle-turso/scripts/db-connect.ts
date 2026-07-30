import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
// A relative import into src, which tsx resolves happily — `pragmas.ts` is pure
// and carries no `$lib` imports, precisely so it can be shared like this.
import { applyFilePragmas, isFileUrl } from '../src/lib/server/db/pragmas';
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
 */

export interface DbConnection {
	db: ReturnType<typeof create>;
	/** Safe to log — credentials removed. */
	label: string;
	close(): Promise<void>;
}

function create(client: ReturnType<typeof createClient>) {
	return drizzle(client, { schema });
}

export function connect(): DbConnection {
	const url = process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db';
	const authToken = process.env.TURSO_AUTH_TOKEN;

	const client = createClient({ url, ...(authToken ? { authToken } : {}) });

	// The boot migration runs before Litestream attaches, so if these were only
	// applied on the app path the entrypoint would hand Litestream a database
	// still in rollback-journal mode. Verified: without this, `journal_mode` was
	// still `delete` after migrate and seed.
	if (isFileUrl(url)) {
		applyFilePragmas(client, (pragma, error) => console.error(`pragma failed: ${pragma}`, error));
	}

	return {
		db: create(client),
		label: url.replace(/\/\/.*@/, '//***@'),
		close: async () => client.close()
	};
}
