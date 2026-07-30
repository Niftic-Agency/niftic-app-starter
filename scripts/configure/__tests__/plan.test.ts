import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readTree } from '../apply';
import { applyPresetDefaults } from '../manifest';
import { buildPlan, matchSelector, resolve, selectVariants, type TreeIndex } from '../plan';
import { VARIANT_ORDER, type Manifest, type VariantId } from '../types';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

function manifest(overrides: Record<string, unknown> = {}): Manifest {
	return applyPresetDefaults({
		name: 'Test App',
		slug: 'test-app',
		description: '',
		visibility: 'client',
		preset: 'turso',
		runtime: { node: 24 },
		deployment: { replicas: 1, productionUrl: '' },
		...overrides
	} as Parameters<typeof applyPresetDefaults>[0]);
}

describe('variant selection', () => {
	it('sqlite layers the extras on top of the shared libSQL variant', () => {
		const selected = selectVariants(manifest({ preset: 'sqlite' }));
		expect(selected).toContain('db-drizzle-turso');
		expect(selected).toContain('db-sqlite-extras');
	});

	it('static selects no db, auth or storage variant', () => {
		const selected = selectVariants(manifest({ preset: 'static' }));
		expect(selected).toEqual(['static-mode', 'host-vercel']);
	});

	it('always returns variants in VARIANT_ORDER', () => {
		const selected = selectVariants(manifest({ preset: 'turso', organizations: true }));
		const ranks = selected.map((id) => VARIANT_ORDER.indexOf(id));
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	it('picks the supabase example, not the drizzle one, on the supabase branch', () => {
		const selected = selectVariants(manifest({ preset: 'supabase' }));
		expect(selected).toContain('example-supabase');
		expect(selected).not.toContain('example-drizzle');
	});
});

describe('selector suffix resolution', () => {
	it('resolves a dialect suffix', () => {
		expect(matchSelector('src/db/schema.pg.ts')).toEqual({
			group: 'dialect',
			value: 'pg',
			resolved: 'src/db/schema.ts'
		});
	});

	it('resolves an authMode suffix — the axis that had no variant of its own', () => {
		expect(matchSelector('src/auth/routes.internal.ts')).toEqual({
			group: 'authMode',
			value: 'internal',
			resolved: 'src/auth/routes.ts'
		});
	});

	it('leaves an ordinary filename alone', () => {
		expect(matchSelector('src/lib/utils.ts')).toBeNull();
		// `.server.ts` is a SvelteKit convention, not one of our selectors.
		expect(matchSelector('src/routes/+page.server.ts')).toBeNull();
	});

	it('finds a selector that is not the last segment before the extension', () => {
		// Regression: only checking the final segment copied an internal-mode spec
		// into a client-mode app, because `auth.internal.spec.ts` parses as
		// base=`auth.internal`, selector=`spec`.
		expect(matchSelector('tests/auth.internal.spec.ts')).toEqual({
			group: 'authMode',
			value: 'internal',
			resolved: 'tests/auth.spec.ts'
		});
		expect(matchSelector('src/routes/login/+page.server.client.ts')).toEqual({
			group: 'authMode',
			value: 'client',
			resolved: 'src/routes/login/+page.server.ts'
		});
	});

	it('resolves a storage suffix — the axis that lets a feature ship two versions', () => {
		expect(matchSelector('src/lib/notes/attachment.r2.ts')).toEqual({
			group: 'storage',
			value: 'r2',
			resolved: 'src/lib/notes/attachment.ts'
		});
		expect(matchSelector('src/lib/notes/attachment.none.ts')).toEqual({
			group: 'storage',
			value: 'none',
			resolved: 'src/lib/notes/attachment.ts'
		});
	});

	it('resolves an organizations suffix — the axis whose value is derived', () => {
		expect(matchSelector('src/lib/server/auth/plugins.orgs.ts')).toEqual({
			group: 'organizations',
			value: 'orgs',
			resolved: 'src/lib/server/auth/plugins.ts'
		});
		expect(matchSelector('src/lib/server/auth/plugins.noorgs.ts')).toEqual({
			group: 'organizations',
			value: 'noorgs',
			resolved: 'src/lib/server/auth/plugins.ts'
		});
	});

	it('never treats the base filename as a selector', () => {
		// A file genuinely called `client.ts` is a module, not a branch marker.
		expect(matchSelector('src/lib/client.ts')).toBeNull();
		expect(matchSelector('src/lib/pg.ts')).toBeNull();
	});
});

describe('repository structure', () => {
	it('VARIANT_ORDER matches variants/ exactly', () => {
		const onDisk = readdirSync(path.join(ROOT, 'variants'), { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort();
		expect(onDisk).toEqual([...VARIANT_ORDER].sort());
	});
});

describe('buildPlan', () => {
	async function planFor(m: Manifest) {
		const tree = await readTree(ROOT);
		return buildPlan(resolve(m), tree);
	}

	it('plans the implemented profile cleanly', async () => {
		const result = await planFor(
			manifest({ preset: 'turso', auth: 'none', storage: 'none', admin: false, example: false })
		);
		expect(result.ok).toBe(true);
	});

	it('is deterministic — the same manifest gives the same plan', async () => {
		const m = manifest({
			preset: 'turso',
			auth: 'none',
			storage: 'none',
			admin: false,
			example: false
		});
		const [a, b] = await Promise.all([planFor(m), planFor(m)]);
		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(JSON.stringify(a.value)).toBe(JSON.stringify(b.value));
	});

	it('orders ops so prune runs last — otherwise it deletes what copies read from', async () => {
		const result = await planFor(
			manifest({ preset: 'turso', auth: 'none', storage: 'none', admin: false, example: false })
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const lastCopy = result.value.ops.findLastIndex((op) => op.kind === 'copy');
		const firstPrune = result.value.ops.findIndex((op) => op.kind === 'prune');
		expect(firstPrune).toBeGreaterThan(lastCopy);
	});

	it('erases itself and the starter-only workflows', async () => {
		const result = await planFor(
			manifest({ preset: 'turso', auth: 'none', storage: 'none', admin: false, example: false })
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const pruned = result.value.ops.filter((op) => op.kind === 'prune').map((op) => op.path);
		expect(pruned).toEqual(
			expect.arrayContaining([
				'variants',
				'scripts/configure',
				'.github/workflows/starter-ci.yml',
				'.github/workflows/bootstrap.yml'
			])
		);
	});

	it('drops engine-only and unselected provisional dependencies', async () => {
		const result = await planFor(
			manifest({ preset: 'turso', auth: 'none', storage: 'none', admin: false, example: false })
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const { dependencies, devDependencies, scripts, removedDeps } = result.value.packageJson;
		// yaml is the engine's parser; adapter-node is the provisional adapter the
		// vercel host didn't re-declare.
		expect(removedDeps).toContain('yaml');
		expect(removedDeps).toContain('@sveltejs/adapter-node');
		expect(devDependencies['@sveltejs/adapter-vercel']).toBeTruthy();
		expect(devDependencies.yaml).toBeUndefined();
		expect(scripts.configure).toBeUndefined();
		// A static app's lockfile must not contain a database driver.
		expect(dependencies['@libsql/client']).toBeTruthy();
	});

	it('prunes the email module and its SDK when email is off', async () => {
		const result = await planFor(
			manifest({
				preset: 'turso',
				auth: 'none',
				storage: 'none',
				admin: false,
				example: false,
				email: false
			})
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Email lives in base, not a variant, so turning it off has to remove the
		// directory explicitly — otherwise a mail SDK ships in an app that can't
		// send mail.
		const removed = result.value.ops
			.filter((op) => op.kind === 'removeDir')
			.map((op) => (op.kind === 'removeDir' ? op.path : ''));
		expect(removed).toContain('src/lib/server/email');
		expect(result.value.packageJson.removedDeps).toContain('resend');
		expect(result.value.packageJson.dependencies.resend).toBeUndefined();

		// ...and its health check must not be registered against a deleted module.
		expect(result.value.registries.some((e) => e.name === 'emailCheck')).toBe(false);
	});

	it('keeps the email module and registers its health check when email is on', async () => {
		const result = await planFor(
			manifest({ preset: 'turso', auth: 'none', storage: 'none', admin: false, example: false })
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.packageJson.dependencies.resend).toBeTruthy();
		expect(result.value.registries.some((e) => e.name === 'emailCheck')).toBe(true);
	});

	it('plans the whole turso preset — the M1 spine is complete', async () => {
		// Every variant this preset selects now exists: db, auth, storage, admin,
		// example and host. This assertion is what makes the milestone real.
		const result = await planFor(manifest({ preset: 'turso' }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.resolved.variants).toEqual([
			'db-drizzle-turso',
			'auth-better',
			'storage-r2',
			'admin-better',
			'example-drizzle',
			'host-vercel'
		]);
	});

	it('plans the turso preset with organizations, and picks the orgs plugin literal', async () => {
		const result = await planFor(manifest({ preset: 'turso', organizations: true }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.resolved.variants).toContain('orgs');

		// The whole point of the `organizations` selector group: exactly one of the
		// two plugin literals lands on `plugins.ts`.
		const copies = result.value.ops.filter(
			(op) => op.kind === 'copy' && op.to === 'src/lib/server/auth/plugins.ts'
		);
		expect(copies).toHaveLength(1);
		expect(copies[0].kind === 'copy' && copies[0].from).toBe(
			'variants/auth-better/src/lib/server/auth/plugins.orgs.ts'
		);
	});

	it('picks the no-organizations plugin literal when orgs are off', async () => {
		const result = await planFor(manifest({ preset: 'turso' }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.resolved.variants).not.toContain('orgs');

		const copies = result.value.ops.filter(
			(op) => op.kind === 'copy' && op.to === 'src/lib/server/auth/plugins.ts'
		);
		expect(copies).toHaveLength(1);
		expect(copies[0].kind === 'copy' && copies[0].from).toBe(
			'variants/auth-better/src/lib/server/auth/plugins.noorgs.ts'
		);
		// ...and no organization table comes along with it.
		expect(
			result.value.ops.some(
				(op) => op.kind === 'copy' && op.to === 'src/lib/server/db/schema/organization.ts'
			)
		).toBe(false);
	});

	it('plans the whole postgres preset — the M2 branch is complete', async () => {
		const result = await planFor(manifest({ preset: 'postgres' }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.resolved.variants).toEqual([
			'db-drizzle-postgres',
			'auth-better',
			'storage-r2',
			'admin-better',
			'example-drizzle',
			'host-vercel'
		]);
		// Every schema file resolves through the `pg` half of the dialect selector.
		expect(result.value.resolved.dialect).toBe('pg');
	});

	it('resolves the pg half of every dialect pair, and copies no sqlite sibling', async () => {
		const result = await planFor(manifest({ preset: 'postgres', organizations: true }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const copies = result.value.ops.filter((op) => op.kind === 'copy');
		const sqliteSources = copies.filter(
			(op) => op.kind === 'copy' && /\.sqlite\.[a-z]+$/.test(op.from)
		);
		expect(sqliteSources).toEqual([]);

		// ...and the tables really did arrive, from their `.pg.ts` siblings.
		const schemaFiles = copies
			.filter((op) => op.kind === 'copy' && op.to.startsWith('src/lib/server/db/schema/'))
			.map((op) => (op.kind === 'copy' ? op.to : ''))
			.sort();
		expect(schemaFiles).toEqual([
			'src/lib/server/db/schema/app-settings.ts',
			'src/lib/server/db/schema/audit-log.ts',
			'src/lib/server/db/schema/auth.ts',
			'src/lib/server/db/schema/notes.ts',
			'src/lib/server/db/schema/organization.ts',
			'src/lib/server/db/schema/uploads.ts'
		]);
	});

	it('fails loudly when a selected variant has not been built yet', async () => {
		// sqlite needs db-sqlite-extras, which lands in M3. Refusing beats emitting
		// an app whose data layer is half there.
		const result = await planFor(manifest({ preset: 'sqlite' }));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.every((e) => e.code === 'E_MISSING_VARIANT')).toBe(true);
		expect(result.errors.map((e) => e.message).join(' ')).toContain('db-sqlite-extras');
	});
});

describe('collision detection', () => {
	function syntheticTree(variants: Partial<Record<VariantId, string[]>>): TreeIndex {
		return {
			basePaths: ['src/app.css', 'src/hooks.server.ts'],
			basePackage: {},
			variants: Object.fromEntries(
				Object.entries(variants).map(([id, files]) => [id, { manifest: {}, files }])
			) as TreeIndex['variants']
		};
	}

	it('rejects two variants writing the same path', () => {
		const tree = syntheticTree({
			'db-drizzle-turso': ['src/lib/server/db/index.ts'],
			'host-vercel': ['src/lib/server/db/index.ts']
		});
		const result = buildPlan(
			resolve(manifest({ auth: 'none', storage: 'none', admin: false, example: false })),
			tree
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.map((e) => e.code)).toContain('E_PATH_COLLISION');
	});

	it('rejects an undeclared overwrite of a base file', () => {
		const tree = syntheticTree({
			'db-drizzle-turso': ['src/hooks.server.ts'],
			'host-vercel': []
		});
		const result = buildPlan(
			resolve(manifest({ auth: 'none', storage: 'none', admin: false, example: false })),
			tree
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.map((e) => e.code)).toContain('E_UNDECLARED_REPLACE');
	});

	it('accepts the overwrite once the variant declares it', () => {
		const tree = syntheticTree({ 'db-drizzle-turso': ['src/hooks.server.ts'], 'host-vercel': [] });
		tree.variants['db-drizzle-turso']!.manifest = { replaces: ['src/hooks.server.ts'] };
		const result = buildPlan(
			resolve(manifest({ auth: 'none', storage: 'none', admin: false, example: false })),
			tree
		);
		expect(result.ok).toBe(true);
	});

	it('rejects a stale replaces entry — the check that catches a base rename', () => {
		const tree = syntheticTree({ 'db-drizzle-turso': [], 'host-vercel': [] });
		tree.variants['db-drizzle-turso']!.manifest = { replaces: ['src/gone.ts'] };
		const result = buildPlan(
			resolve(manifest({ auth: 'none', storage: 'none', admin: false, example: false })),
			tree
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.map((e) => e.code)).toContain('E_STALE_REPLACE');
	});
});
