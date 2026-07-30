import { defineConfig } from 'drizzle-kit';

/**
 * Dialect `postgresql` — not `pg`, which is the Better Auth adapter's name for
 * the same thing and an easy pair to confuse.
 *
 * drizzle-kit connects directly rather than through the app's client, so it does
 * not go through `connectionOptions`. Point `DATABASE_URL` at the pooler here
 * too: `generate` never connects at all, and `push`/`studio` are development
 * tools you run against a database you can already reach.
 */
export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/db/schema',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? ''
	},
	strict: true,
	verbose: true
});
