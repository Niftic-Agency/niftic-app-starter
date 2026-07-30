import { eq } from 'drizzle-orm';
import { connect } from './db-connect';
import * as schema from '../src/lib/server/db/schema/index';

/**
 * `pnpm db:seed` — idempotent. Safe to run against production.
 *
 * Creates the initial admin from ADMIN_EMAIL and writes default app_settings.
 * Re-running promotes an existing user to admin rather than erroring, which is
 * how you recover from "nobody can get into /admin".
 *
 * ADMIN_PASSWORD is optional and intended for local dev and CI only. Without it
 * the admin is created with no password and must use the reset-password flow —
 * which is the right production behaviour, because a seeded password is a
 * shared secret sitting in someone's shell history.
 *
 * Dialect-agnostic: the connection comes from `./db-connect`, which the selected
 * database variant ships. Everything below is plain Drizzle that means the same
 * thing on libSQL and on Postgres — which is the same discipline the repository
 * layer follows, and what keeps the lite→postgres graduation mechanical.
 */

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminEmail) {
	console.error('ADMIN_EMAIL is required. Set it and re-run.');
	process.exit(1);
}

const { db, close } = connect();

const now = new Date();

const existing = await db.query.user.findFirst({ where: eq(schema.user.email, adminEmail) });

if (existing) {
	if (existing.role !== 'admin') {
		await db
			.update(schema.user)
			.set({ role: 'admin', updatedAt: now })
			.where(eq(schema.user.id, existing.id));
		console.log(`Promoted ${adminEmail} to admin.`);
	} else {
		console.log(`${adminEmail} is already an admin.`);
	}
} else {
	const userId = crypto.randomUUID();
	await db.insert(schema.user).values({
		id: userId,
		name: adminEmail.split('@')[0],
		email: adminEmail,
		// Seeded by an operator who already controls the address, so treat it as
		// verified — otherwise the first admin can never sign in.
		emailVerified: true,
		role: 'admin',
		createdAt: now,
		updatedAt: now
	});

	if (adminPassword) {
		// Better Auth owns password hashing, so ask it rather than reimplementing.
		// Imported from `better-auth/crypto` rather than from our own auth module:
		// that module uses $lib and $app/server aliases, which only Vite resolves,
		// and this script runs under plain tsx.
		const { hashPassword } = await import('better-auth/crypto');
		const hash = await hashPassword(adminPassword);

		await db.insert(schema.account).values({
			id: crypto.randomUUID(),
			accountId: userId,
			providerId: 'credential',
			userId,
			password: hash,
			createdAt: now,
			updatedAt: now
		});
		console.log(`Created admin ${adminEmail} with a password from ADMIN_PASSWORD.`);
	} else {
		console.log(`Created admin ${adminEmail}. Use "Forgot password" to set a password.`);
	}
}

const defaults: { key: string; value: string }[] = [
	{ key: 'app.signupsOpen', value: 'true' },
	{ key: 'app.maintenanceMessage', value: '""' }
];

for (const setting of defaults) {
	await db
		.insert(schema.appSettings)
		.values({ ...setting, updatedAt: now })
		.onConflictDoNothing({ target: schema.appSettings.key });
}

console.log(`Seeded ${defaults.length} default settings.`);
await close();
