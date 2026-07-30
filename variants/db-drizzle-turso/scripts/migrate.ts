import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

/**
 * Apply committed migrations.
 *
 * On Vercel there is no boot hook, so this runs from CI on main. On Dokploy the
 * entrypoint runs it before starting the server. Either way the migrations in
 * `drizzle/` are the source of truth and are always committed.
 */
const url = process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, ...(authToken ? { authToken } : {}) });
const db = drizzle(client);

console.log(`Migrating ${url.replace(/\/\/.*@/, '//***@')}`);
await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations applied.');

client.close();
