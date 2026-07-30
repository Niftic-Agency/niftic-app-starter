import {
	OP_PHASE,
	SELECTOR_GROUPS,
	VARIANT_ORDER,
	type Capabilities,
	type ConfigureError,
	type Dialect,
	type EnvSection,
	type FileOp,
	type Manifest,
	type PackageMerge,
	type Plan,
	type RegistryEntry,
	type ResolvedManifest,
	type Result,
	type SelectorGroup,
	type TokenName,
	type VariantId,
	type VariantManifest
} from './types';

/**
 * Pure planning. No filesystem access — the caller supplies a `TreeIndex` it
 * read once. That is what lets the exhaustive legality sweep plan all 8,640 axis
 * combinations in well under a second, and what makes plan snapshots reviewable.
 */

export interface VariantEntry {
	manifest: VariantManifest;
	/** Paths relative to the variant root, e.g. `src/lib/server/db/index.ts`. */
	files: string[];
}

export interface TreeIndex {
	/** Repo-relative paths present in the base tree. */
	basePaths: string[];
	variants: Partial<Record<VariantId, VariantEntry>>;
	/** Parsed base package.json. */
	basePackage: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		scripts?: Record<string, string>;
		niftic?: {
			engineOnly?: string[];
			engineScripts?: string[];
			provisional?: string[];
			/** capability → deps that only exist while that capability is on. */
			capabilityDeps?: Record<string, string[]>;
			/** capability → base paths removed when that capability is off. */
			capabilityPaths?: Record<string, string[]>;
		};
	};
}

// ─── selection ───────────────────────────────────────────────────────────────

export function selectVariants(m: Manifest): VariantId[] {
	const selected = new Set<VariantId>();

	switch (m.data) {
		case 'turso':
			selected.add('db-drizzle-turso');
			break;
		case 'sqlite':
			// Same libSQL client as Turso, pointed at a `file:` URL, plus the
			// pragma/Litestream/migrate-on-boot extras layered on top.
			selected.add('db-drizzle-turso');
			selected.add('db-sqlite-extras');
			break;
		case 'postgres':
			selected.add('db-drizzle-postgres');
			break;
		case 'supabase':
			selected.add('db-supabase');
			break;
		case 'none':
			selected.add('static-mode');
			break;
	}

	if (m.auth === 'better-auth') selected.add('auth-better');
	if (m.auth === 'supabase-auth') selected.add('auth-supabase');
	if (m.organizations) selected.add('orgs');

	if (m.storage === 'r2') selected.add('storage-r2');
	if (m.storage === 'supabase') selected.add('storage-supabase');

	if (m.admin && m.auth === 'better-auth') selected.add('admin-better');
	if (m.admin && m.auth === 'supabase-auth') selected.add('admin-supabase');

	if (m.example && m.data === 'supabase') selected.add('example-supabase');
	else if (m.example && m.data !== 'none') selected.add('example-drizzle');

	selected.add(m.host === 'vercel' ? 'host-vercel' : 'host-dokploy');

	return VARIANT_ORDER.filter((id) => selected.has(id));
}

export function dialectFor(data: Manifest['data']): Dialect {
	if (data === 'turso' || data === 'sqlite') return 'sqlite';
	if (data === 'postgres') return 'pg';
	return 'none';
}

export function resolve(m: Manifest): ResolvedManifest {
	const capabilities: Capabilities = {
		db: m.data !== 'none',
		auth: m.auth !== 'none',
		organizations: m.organizations,
		storage: m.storage !== 'none',
		email: m.email,
		admin: m.admin,
		example: m.example
	};

	const tokens: Record<TokenName, string> = {
		APP_NAME: m.name,
		APP_SLUG: m.slug,
		APP_DESCRIPTION: m.description,
		APP_URL: m.deployment.productionUrl,
		PROFILE: m.preset,
		NODE_VERSION: String(m.runtime.node),
		REPLICAS: String(m.deployment.replicas),
		DRIZZLE_DIALECT: m.data === 'postgres' ? 'postgresql' : m.data === 'turso' ? 'turso' : 'sqlite'
	};

	return {
		manifest: m,
		profile: m.preset,
		dialect: dialectFor(m.data),
		adapter: m.host === 'vercel' ? 'vercel' : 'node',
		capabilities,
		variants: selectVariants(m),
		tokens
	};
}

// ─── selector suffix resolution ──────────────────────────────────────────────

interface SelectorMatch {
	group: SelectorGroup;
	value: string;
	/** Path with the selector segment removed. */
	resolved: string;
}

function groupFor(segment: string): SelectorGroup | null {
	for (const [group, values] of Object.entries(SELECTOR_GROUPS)) {
		if ((values as readonly string[]).includes(segment)) return group as SelectorGroup;
	}
	return null;
}

/**
 * `schema.pg.ts` → group `dialect`, value `pg`, resolved `schema.ts`.
 * Returns null for a plain filename.
 *
 * Every dotted segment after the base name is checked, not just the one before
 * the extension. Compound extensions are common here — `auth.internal.spec.ts`,
 * `+page.server.client.ts` — and only looking at the last segment silently
 * copied an internal-mode test into a client-mode app, which is how this rule
 * got written.
 *
 * Selector values (`pg`, `sqlite`, `internal`, `client`) are specific enough
 * that a false positive means the file really was meant to be branch-specific.
 */
export function matchSelector(path: string): SelectorMatch | null {
	const slash = path.lastIndexOf('/');
	const dir = slash === -1 ? '' : path.slice(0, slash + 1);
	const filename = path.slice(slash + 1);

	const segments = filename.split('.');
	// Never treat the base name itself as a selector, and never the extension.
	for (let i = 1; i < segments.length - 1; i++) {
		const group = groupFor(segments[i]);
		if (!group) continue;

		const resolved = dir + [...segments.slice(0, i), ...segments.slice(i + 1)].join('.');
		return { group, value: segments[i], resolved };
	}

	return null;
}

function selectorValueFor(group: SelectorGroup, resolved: ResolvedManifest): string {
	switch (group) {
		case 'dialect':
			return resolved.dialect;
		case 'authMode':
			return resolved.manifest.authMode;
		case 'storage':
			return resolved.manifest.storage;
	}
}

// ─── plan ────────────────────────────────────────────────────────────────────

const byteCompare = (a: string, b: string): number =>
	Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

const destinationOf = (op: FileOp): string => ('to' in op ? op.to : op.path);

/** Paths the engine always removes, so a variant need not declare them. */
export const SELF_ERASED = ['variants', 'scripts/configure'] as const;

export function buildPlan(resolved: ResolvedManifest, tree: TreeIndex): Result<Plan> {
	const errors: ConfigureError[] = [];
	const warnings: string[] = [];
	const ops: FileOp[] = [];

	const baseSet = new Set(tree.basePaths);
	/** destination path → variant that wrote it, for collision detection. */
	const writers = new Map<string, VariantId>();
	const removals = new Map<string, string>();

	// ── pass 1: removals declared by any selected variant ────────────────────
	for (const id of resolved.variants) {
		const entry = tree.variants[id];
		if (!entry) {
			errors.push({
				code: 'E_MISSING_VARIANT',
				message: `variant "${id}" is selected but variants/${id}/ has no variant.json`,
				fix: [`create variants/${id}/variant.json`]
			});
			continue;
		}
		for (const path of entry.manifest.remove ?? []) {
			if (!baseSet.has(path)) {
				errors.push({
					code: 'E_STALE_REMOVE',
					message: `variants/${id}/variant.json removes "${path}", which does not exist in the base tree`,
					why: 'A stale remove usually means base renamed or deleted the file and the variant was not updated.',
					fix: [`drop "${path}" from that variant's "remove" list`]
				});
				continue;
			}
			removals.set(path, id);
		}
	}

	// ── pass 2: copies ───────────────────────────────────────────────────────
	for (const id of resolved.variants) {
		const entry = tree.variants[id];
		if (!entry) continue;

		const declaredReplaces = new Set(entry.manifest.replaces ?? []);
		for (const path of declaredReplaces) {
			if (!baseSet.has(path)) {
				errors.push({
					code: 'E_STALE_REPLACE',
					message: `variants/${id}/variant.json declares replaces "${path}", which does not exist in the base tree`,
					why: 'This is the check that catches a base rename orphaning an override — without it the variant would silently add a file nobody reads.',
					fix: [`update or drop "${path}" in that variant's "replaces" list`]
				});
			}
		}

		for (const file of [...entry.files].sort(byteCompare)) {
			const selector = matchSelector(file);
			let to = file;

			if (selector) {
				// Skip the sibling that this profile didn't select.
				if (selector.value !== selectorValueFor(selector.group, resolved)) continue;
				to = selector.resolved;
			}

			const replacesBase = baseSet.has(to);
			if (replacesBase && !declaredReplaces.has(to)) {
				errors.push({
					code: 'E_UNDECLARED_REPLACE',
					message: `variants/${id}/ writes "${to}", which already exists in the base tree`,
					why: 'Overwriting base silently is how a variant ends up owning a file it should have extended.',
					fix: [
						`add "${to}" to that variant's "replaces" list if the overwrite is intended`,
						'otherwise contribute through a registry instead of replacing the file'
					]
				});
			}

			const existing = writers.get(to);
			if (existing) {
				errors.push({
					code: 'E_PATH_COLLISION',
					message: `variants/${existing}/ and variants/${id}/ both write "${to}"`,
					why: 'Only one variant per axis is ever selected, so a collision means the shared concern belongs in base behind a registry.',
					fix: ['move the shared part into base and have both variants contribute to a registry']
				});
				continue;
			}

			if (removals.has(to)) {
				errors.push({
					code: 'E_REMOVE_WRITE_CONFLICT',
					message: `variants/${removals.get(to)}/ removes "${to}" but variants/${id}/ writes it`,
					fix: [`use "replaces" in variants/${id}/variant.json rather than remove + write`]
				});
				continue;
			}

			writers.set(to, id);
			ops.push({
				kind: 'copy',
				from: `variants/${id}/${file}`,
				to,
				variant: id,
				replacesBase,
				...(selector ? { selector: { group: selector.group, value: selector.value } } : {})
			});
		}
	}

	for (const [path, id] of removals) {
		ops.push({ kind: 'remove', path, reason: `removed by variant ${id}` });
	}

	// ── pass 3: engine-generated files ───────────────────────────────────────
	const generated: FileOp[] = [
		{ kind: 'generate', to: 'src/lib/app-config.ts', generator: 'app-config' },
		{ kind: 'generate', to: 'src/lib/server/env.ts', generator: 'env-module' },
		{ kind: 'generate', to: '.env.example', generator: 'env-example' },
		{ kind: 'generate', to: 'package.json', generator: 'package-json' },
		{ kind: 'generate', to: 'svelte.config.js', generator: 'svelte-config' },
		{ kind: 'generate', to: 'src/lib/server/registry/hooks.ts', generator: 'registry:hooks' },
		{ kind: 'generate', to: 'src/lib/server/registry/health.ts', generator: 'registry:health' },
		{ kind: 'generate', to: 'src/lib/registry/nav.ts', generator: 'registry:nav' }
	];

	// Only the Drizzle branches have a schema barrel; Supabase keeps its schema in
	// SQL migrations and its types in a generated database.types.ts.
	if (resolved.dialect !== 'none') {
		generated.push({
			kind: 'generate',
			to: 'src/lib/server/db/schema/index.ts',
			generator: 'db-schema'
		});
	}

	ops.push(...generated);

	// ── pass 3b: capabilities that are switched off ──────────────────────────
	// These modules live in base rather than in a variant, so turning the
	// capability off has to remove them explicitly.
	for (const [capability, paths] of Object.entries(
		tree.basePackage.niftic?.capabilityPaths ?? {}
	)) {
		if (resolved.capabilities[capability as keyof typeof resolved.capabilities]) continue;
		for (const path of paths) {
			ops.push({ kind: 'removeDir', path, reason: `${capability} is disabled` });
		}
	}

	// ── pass 4: prune (terminal phase — these delete what pass 2 copied from) ──
	for (const dir of ['variants', 'scripts/configure']) {
		ops.push({
			kind: 'prune',
			path: dir,
			recursive: true,
			reason: 'configure is one-way and self-erasing'
		});
	}
	for (const file of ['.github/workflows/starter-ci.yml', '.github/workflows/bootstrap.yml']) {
		ops.push({ kind: 'prune', path: file, recursive: false, reason: 'starter-only workflow' });
	}

	// ── package.json ─────────────────────────────────────────────────────────
	const packageJson = mergePackageJson(resolved, tree, errors);

	// ── env + registries ─────────────────────────────────────────────────────
	const env = buildEnvSections(resolved, tree);
	const registries = buildRegistries(resolved, tree, errors);

	if (errors.length > 0) return { ok: false, errors };

	// Total order: phase, then destination, then source. Never localeCompare.
	ops.sort(
		(a, b) =>
			OP_PHASE[a.kind] - OP_PHASE[b.kind] ||
			byteCompare(destinationOf(a), destinationOf(b)) ||
			byteCompare('from' in a ? a.from : '', 'from' in b ? b.from : '')
	);

	return { ok: true, value: { resolved, ops, packageJson, env, registries, warnings } };
}

// ─── package.json merge ──────────────────────────────────────────────────────

function sortedRecord(input: Record<string, string>): Record<string, string> {
	return Object.fromEntries(Object.entries(input).sort(([a], [b]) => byteCompare(a, b)));
}

export function mergePackageJson(
	resolved: ResolvedManifest,
	tree: TreeIndex,
	errors: ConfigureError[]
): PackageMerge {
	const niftic = tree.basePackage.niftic ?? {};
	const engineOnly = new Set(niftic.engineOnly ?? []);
	const engineScripts = new Set(niftic.engineScripts ?? []);
	const provisional = new Set(niftic.provisional ?? []);

	const dependencies = { ...(tree.basePackage.dependencies ?? {}) };
	const devDependencies = { ...(tree.basePackage.devDependencies ?? {}) };
	const scripts = { ...(tree.basePackage.scripts ?? {}) };

	/** Provisional deps a selected variant re-declared, so they survive. */
	const keptProvisional = new Set<string>();

	for (const id of resolved.variants) {
		const entry = tree.variants[id];
		if (!entry) continue;
		const { dependencies: d = {}, devDependencies: dd = {}, scripts: s = {} } = entry.manifest;

		for (const [target, incoming] of [
			[dependencies, d],
			[devDependencies, dd]
		] as const) {
			for (const [name, version] of Object.entries(incoming)) {
				if (provisional.has(name)) keptProvisional.add(name);
				const existing = target[name];
				// A disagreement between two of our own variants is a repo bug, not
				// something to resolve at runtime — one lockfile has to serve them all.
				if (existing && existing !== version && !provisional.has(name)) {
					errors.push({
						code: 'E_DEP_CONFLICT',
						message: `dependency "${name}" is pinned to both ${existing} and ${version} (variant ${id})`,
						fix: [`align the version, or move "${name}" to the base package.json`]
					});
					continue;
				}
				target[name] = version;
			}
		}

		for (const [key, command] of Object.entries(s)) {
			const existing = scripts[key];
			if (existing && existing !== command) {
				errors.push({
					code: 'E_SCRIPT_CONFLICT',
					message: `script "${key}" is defined twice with different commands (variant ${id})`,
					fix: [`rename one of them, or move "${key}" to the base package.json`]
				});
				continue;
			}
			scripts[key] = command;
		}
	}

	const removedDeps: string[] = [];
	const removedScripts: string[] = [];

	for (const name of [...engineOnly].sort(byteCompare)) {
		if (name in devDependencies) {
			delete devDependencies[name];
			removedDeps.push(name);
		}
		if (name in dependencies) {
			delete dependencies[name];
			removedDeps.push(name);
		}
	}
	for (const name of [...provisional].sort(byteCompare)) {
		if (keptProvisional.has(name)) continue;
		if (name in devDependencies) {
			delete devDependencies[name];
			removedDeps.push(name);
		}
	}
	for (const key of [...engineScripts].sort(byteCompare)) {
		if (key in scripts) {
			delete scripts[key];
			removedScripts.push(key);
		}
	}

	// Capability deps: a static app must not carry a mail SDK in its lockfile.
	for (const [capability, names] of Object.entries(niftic.capabilityDeps ?? {})) {
		if (resolved.capabilities[capability as keyof typeof resolved.capabilities]) continue;
		for (const name of [...names].sort(byteCompare)) {
			if (name in dependencies) {
				delete dependencies[name];
				removedDeps.push(name);
			}
			if (name in devDependencies) {
				delete devDependencies[name];
				removedDeps.push(name);
			}
		}
	}

	return {
		dependencies: sortedRecord(dependencies),
		devDependencies: sortedRecord(devDependencies),
		scripts: sortedRecord(scripts),
		removedDeps: removedDeps.sort(byteCompare),
		removedScripts: removedScripts.sort(byteCompare)
	};
}

// ─── env ─────────────────────────────────────────────────────────────────────

function buildEnvSections(resolved: ResolvedManifest, tree: TreeIndex): EnvSection[] {
	const sections: EnvSection[] = [
		{
			title: 'Core',
			source: 'core',
			vars: [
				{ name: 'ORIGIN', required: true, note: 'Public URL of the deployed app.' },
				{ name: 'PUBLIC_APP_NAME', required: false, example: resolved.manifest.name },
				{
					name: 'LOG_LEVEL',
					required: false,
					note: 'debug | info | warn | error',
					example: 'info'
				},
				{
					name: 'GIT_SHA',
					required: false,
					note: 'Deploy identifier surfaced by /api/health. Set by CI or the host.'
				}
			]
		}
	];

	if (resolved.manifest.email) {
		sections.push({
			title: 'Email (Resend)',
			source: 'core',
			vars: [
				{ name: 'RESEND_API_KEY', required: true },
				{ name: 'EMAIL_FROM', required: true, example: `no-reply@${resolved.manifest.slug}.com` },
				{ name: 'EMAIL_REPLY_TO', required: false },
				{
					name: 'EMAIL_DRY_RUN',
					required: false,
					note: 'Logs the payload instead of sending. Defaults true outside production.',
					example: 'true'
				}
			]
		});
	}

	for (const id of resolved.variants) {
		const vars = tree.variants[id]?.manifest.env;
		if (!vars || vars.length === 0) continue;
		sections.push({ title: id, source: id, vars });
	}

	return sections;
}

// ─── registries ──────────────────────────────────────────────────────────────

function buildRegistries(
	resolved: ResolvedManifest,
	tree: TreeIndex,
	errors: ConfigureError[]
): RegistryEntry[] {
	const entries: RegistryEntry[] = [
		{
			registry: 'hooks',
			name: 'handleRequestId',
			from: '$lib/server/request-id',
			order: 0,
			source: 'base'
		}
	];

	// Email lives in base rather than a variant, so its health check is
	// registered here rather than through a variant.json declaration.
	if (resolved.capabilities.email) {
		entries.push({
			registry: 'health',
			name: 'emailCheck',
			from: '$lib/server/email/health',
			order: 30,
			source: 'base'
		});
	}

	for (const id of resolved.variants) {
		const declared = tree.variants[id]?.manifest.registries;
		if (!declared) continue;
		for (const registry of ['hooks', 'health', 'nav'] as const) {
			for (const decl of declared[registry] ?? []) {
				entries.push({ registry, source: id, ...decl });
			}
		}
	}

	const seen = new Set<string>();
	for (const entry of entries) {
		const key = `${entry.registry}:${entry.name}`;
		if (seen.has(key)) {
			errors.push({
				code: 'E_REGISTRY_COLLISION',
				message: `two variants contribute "${entry.name}" to the ${entry.registry} registry`,
				fix: ['rename one of the exported symbols']
			});
		}
		seen.add(key);
	}

	// order, then variant order, then name — a total order, so the generated
	// import block is byte-stable.
	const rank = (source: RegistryEntry['source']) =>
		source === 'base' ? -1 : VARIANT_ORDER.indexOf(source);

	return entries.sort(
		(a, b) =>
			byteCompare(a.registry, b.registry) ||
			a.order - b.order ||
			rank(a.source) - rank(b.source) ||
			byteCompare(a.name, b.name)
	);
}
