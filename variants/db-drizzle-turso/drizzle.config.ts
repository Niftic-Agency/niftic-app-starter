import { defineConfig } from 'drizzle-kit';

/**
 * Dialect `turso` covers hosted libSQL and a local `file:` URL alike. There is
 * no `driver` field for Turso — drizzle-kit handles it from the dialect.
 */
export default defineConfig({
	dialect: 'turso',
	schema: './src/lib/server/db/schema',
	out: './drizzle',
	dbCredentials: {
		url: process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db',
		authToken: process.env.TURSO_AUTH_TOKEN
	},
	strict: true,
	verbose: true
});
