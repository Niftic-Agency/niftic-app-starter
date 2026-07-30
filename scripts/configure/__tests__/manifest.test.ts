import { describe, expect, it } from 'vitest';
import { applyPresetDefaults, checkLegality, loadManifest, PRESETS } from '../manifest';
import type { AuthAxis, DataAxis, HostAxis, Manifest, StorageAxis } from '../types';

/**
 * The legality rules are the part of the engine with the most spec content, so
 * they get the most direct tests: every rule has a fixture that must fail, and
 * the assertions are on the error CODE rather than the prose, so error copy can
 * be improved without breaking the suite.
 */

function manifest(overrides: Partial<Manifest> = {}): Manifest {
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

const codes = (m: Manifest) => checkLegality(m).map((e) => e.code);

describe('preset defaults', () => {
	it('fills every axis from the preset', () => {
		const m = manifest({ preset: 'sqlite' });
		expect(m.data).toBe('sqlite');
		expect(m.host).toBe('dokploy');
		expect(m.auth).toBe('better-auth');
		expect(m.deployment.provider).toBe('dokploy');
	});

	it('lets an explicit value override the preset', () => {
		const m = manifest({ preset: 'postgres', host: 'dokploy' } as Partial<Manifest>);
		expect(m.data).toBe('postgres');
		expect(m.host).toBe('dokploy');
		// provider follows host, not the preset
		expect(m.deployment.provider).toBe('dokploy');
	});

	it('every preset is legal with no overrides', () => {
		for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
			expect(codes(manifest({ preset })), `preset ${preset}`).toEqual([]);
		}
	});
});

describe('legality rules', () => {
	it('rule 1 — sqlite requires dokploy', () => {
		expect(codes(manifest({ preset: 'sqlite', host: 'vercel' } as Partial<Manifest>))).toContain(
			'E_SQLITE_HOST'
		);
	});

	it('rule 1 — sqlite requires exactly one replica', () => {
		const m = manifest({ preset: 'sqlite' });
		m.deployment.replicas = 2;
		expect(codes(m)).toContain('E_SQLITE_REPLICAS');
	});

	it('rule 2 — supabase data and supabase auth are inseparable', () => {
		expect(
			codes(manifest({ preset: 'supabase', auth: 'better-auth' } as Partial<Manifest>))
		).toContain('E_SUPABASE_AUTH');
		expect(
			codes(manifest({ preset: 'turso', auth: 'supabase-auth' } as Partial<Manifest>))
		).toContain('E_AUTH_SUPABASE_DATA');
	});

	it('rule 3 — R2 is illegal on the supabase branch', () => {
		expect(codes(manifest({ preset: 'supabase', storage: 'r2' } as Partial<Manifest>))).toContain(
			'E_SUPABASE_R2'
		);
	});

	it('rule 3 — Supabase Storage is illegal off the supabase branch', () => {
		expect(
			codes(manifest({ preset: 'turso', storage: 'supabase' } as Partial<Manifest>))
		).toContain('E_STORAGE_SUPABASE_DATA');
	});

	it('rule 3 — storage requires auth, because uploads are keyed by user', () => {
		expect(
			codes(
				manifest({
					preset: 'turso',
					auth: 'none',
					admin: false,
					storage: 'r2'
				} as Partial<Manifest>)
			)
		).toContain('E_STORAGE_AUTH');
	});

	it('rule 4 — organizations require Better Auth', () => {
		expect(
			codes(manifest({ preset: 'supabase', organizations: true } as Partial<Manifest>))
		).toContain('E_ORGS_AUTH');
	});

	it('rule 5 — static mode forbids auth, storage and admin', () => {
		const found = codes(
			manifest({
				preset: 'static',
				auth: 'better-auth',
				storage: 'r2',
				admin: true
			} as Partial<Manifest>)
		);
		expect(found).toContain('E_STATIC_AUTH');
		expect(found).toContain('E_STATIC_STORAGE');
		expect(found).toContain('E_STATIC_ADMIN');
	});

	it('rule 5 — static mode still allows email for the contact endpoint', () => {
		expect(codes(manifest({ preset: 'static', email: true } as Partial<Manifest>))).toEqual([]);
	});

	it('rule 8 — admin requires auth', () => {
		expect(
			codes(manifest({ preset: 'turso', auth: 'none', admin: true } as Partial<Manifest>))
		).toContain('E_ADMIN_AUTH');
	});

	it('reports every problem at once, not just the first', () => {
		const m = manifest({ preset: 'sqlite', host: 'vercel' } as Partial<Manifest>);
		m.deployment.replicas = 4;
		m.deployment.provider = 'vercel';
		expect(checkLegality(m).length).toBeGreaterThan(1);
	});

	it('every error carries a reason and at least one concrete fix', () => {
		const m = manifest({ preset: 'sqlite', host: 'vercel' } as Partial<Manifest>);
		for (const error of checkLegality(m)) {
			expect(error.why, error.code).toBeTruthy();
			expect(error.fix?.length, error.code).toBeGreaterThan(0);
		}
	});
});

/**
 * The exhaustive sweep. Every axis combination is checked, which is what makes
 * "collision is a hard error" safe elsewhere in the engine: if a combination can
 * fail, it fails here on a PR rather than on someone's machine.
 */
describe('exhaustive axis sweep', () => {
	const DATA: DataAxis[] = ['turso', 'sqlite', 'postgres', 'supabase', 'none'];
	const HOST: HostAxis[] = ['vercel', 'dokploy'];
	const AUTH: AuthAxis[] = ['better-auth', 'supabase-auth', 'none'];
	const STORAGE: StorageAxis[] = ['r2', 'supabase', 'none'];
	const BOOL = [true, false];

	function* combinations() {
		for (const data of DATA)
			for (const host of HOST)
				for (const auth of AUTH)
					for (const storage of STORAGE)
						for (const organizations of BOOL)
							for (const admin of BOOL)
								for (const example of BOOL)
									for (const replicas of [1, 2])
										yield { data, host, auth, storage, organizations, admin, example, replicas };
	}

	it('classifies every combination without throwing', () => {
		let legal = 0;
		let total = 0;

		for (const combo of combinations()) {
			total++;
			const m = manifest();
			Object.assign(m, {
				data: combo.data,
				host: combo.host,
				auth: combo.auth,
				storage: combo.storage,
				organizations: combo.organizations,
				admin: combo.admin,
				example: combo.example
			});
			m.deployment.provider = combo.host;
			m.deployment.replicas = combo.replicas;

			const errors = checkLegality(m);
			expect(Array.isArray(errors)).toBe(true);
			if (errors.length === 0) legal++;
		}

		expect(total).toBe(1440);

		// 202 is derived by hand, not copied from a previous run — otherwise this
		// assertion would just ratify whatever the code currently does.
		// (It was 220 before storage started requiring auth.)
		//
		//   turso     host×2 · example×2 · replicas×2 = 8 outer
		//             auth=better-auth → storage{r2,none}×2 · orgs×2 · admin×2 = 8 → 64
		//             auth=none        → storage=none, orgs=F, admin=F     = 1 →  8
		//                                                                        → 72
		//   postgres  same shape                                                 → 72
		//   sqlite    host=dokploy, replicas=1 → outer 2                         → 18
		//   supabase  auth=supabase-auth, storage{supabase,none}×2, orgs=F,
		//             admin×2, host×2, example×2, replicas×2                     → 32
		//   none      everything forced except host×2 · example×2 · replicas×2   →  8
		expect(legal).toBe(202);
	});

	it('never accepts sqlite outside dokploy, or orgs without Better Auth', () => {
		for (const combo of combinations()) {
			const m = manifest();
			Object.assign(m, combo, { deployment: { ...m.deployment, provider: combo.host } });
			m.deployment.replicas = combo.replicas;

			if (checkLegality(m).length > 0) continue;
			if (m.data === 'sqlite') {
				expect(m.host).toBe('dokploy');
				expect(m.deployment.replicas).toBe(1);
			}
			if (m.organizations) expect(m.auth).toBe('better-auth');
			if (m.admin) expect(m.auth).not.toBe('none');
			if (m.data === 'none') expect(m.storage).toBe('none');
			// No anonymous uploads: there would be no user to key them by.
			if (m.storage !== 'none') expect(m.auth).not.toBe('none');
		}
	});
});

describe('loadManifest', () => {
	const valid = `name: Demo\nslug: demo\npreset: turso\nauth: none\nstorage: none\nadmin: false\nexample: false\n`;

	it('parses a legal manifest', () => {
		const result = loadManifest(valid);
		expect(result.ok).toBe(true);
	});

	it('points at the offending line', () => {
		const result = loadManifest(`name: Demo\nslug: demo\npreset: sqlite\nhost: vercel\n`);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const hostError = result.errors.find((e) => e.code === 'E_SQLITE_HOST');
		expect(hostError?.line).toBe(4);
	});

	it('rejects a slug that would break a package or bucket name', () => {
		const result = loadManifest(`name: Demo\nslug: Not A Slug\npreset: static\n`);
		expect(result.ok).toBe(false);
	});

	it('rejects a description that could break out of a generated string', () => {
		const result = loadManifest(
			'name: Demo\nslug: demo\npreset: static\ndescription: "bad ${injection}"\n'
		);
		expect(result.ok).toBe(false);
	});
});
