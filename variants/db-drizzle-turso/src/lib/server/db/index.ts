import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { applyFilePragmas, isFileUrl } from './pragmas';
import * as schema from './schema';

/**
 * The libSQL client, used identically for hosted Turso and local SQLite.
 *
 * `TURSO_DATABASE_URL` is either `libsql://...` (hosted, needs the auth token)
 * or `file:./.data/dev.db` (local dev, unit tests, and the CI lane). Running the
 * same driver in tests as in production is deliberate: a separate test driver
 * lets dialect differences hide until deploy.
 *
 * Do not reach for embedded replicas or sync here. They complicate the export and
 * migration story for no benefit at the sizes these apps run at.
 */
function createDb() {
	const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = env();

	const client = createClient({
		url: TURSO_DATABASE_URL,
		...(TURSO_AUTH_TOKEN ? { authToken: TURSO_AUTH_TOKEN } : {})
	});

	// Keyed off the URL rather than the profile, because that is the actual
	// condition: pragmas apply to a local file and mean nothing to hosted libSQL.
	// It catches the `sqlite` profile in production and the `turso` profile's
	// local dev database alike, which is the behaviour you want in both.
	if (isFileUrl(TURSO_DATABASE_URL)) {
		applyFilePragmas(client, (pragma, error) =>
			logger.error('db.pragma_failed', { pragma, error })
		);
	}

	return drizzle(client, { schema });
}

// Lazy so importing this module never forces env validation at build time.
let instance: ReturnType<typeof createDb> | undefined;

export function db(): ReturnType<typeof createDb> {
	instance ??= createDb();
	return instance;
}

export { schema };
