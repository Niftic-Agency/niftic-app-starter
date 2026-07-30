import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connect } from './db-connect';

/**
 * Apply committed migrations.
 *
 * On Vercel there is no boot hook, so this runs from CI on main. On Dokploy the
 * entrypoint runs it before starting the server. Either way the migrations in
 * `drizzle/` are the source of truth and are always committed.
 *
 * Drizzle runs each migration inside a transaction, which is safe through a
 * transaction pooler — a transaction is pinned to one backend for its duration.
 * Migrations are still the one job worth pointing at the database directly if
 * you have the choice: a DDL statement blocked behind a pooler queue is a
 * confusing way to spend an outage.
 */
const { db, label, close } = connect();

console.log(`Migrating ${label}`);
await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations applied.');

await close();
