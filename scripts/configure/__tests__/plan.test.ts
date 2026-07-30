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

	it('fails loudly when a selected variant has not been built yet', async () => {
		// The full turso preset pulls in auth/storage/admin/example, which land in M1.
		const result = await planFor(manifest({ preset: 'turso' }));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.every((e) => e.code === 'E_MISSING_VARIANT')).toBe(true);
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
