/**
 * Shared types for the configure engine.
 *
 * The planner is pure: `buildPlan(resolved, tree)` touches no filesystem and
 * returns a value that serialises to canonical JSON. That is what makes golden
 * plan snapshots and the exhaustive legality sweep cheap enough to run on every
 * PR. All effects live in `apply.ts` behind the `FsIo` interface.
 */

export type DataAxis = 'turso' | 'sqlite' | 'postgres' | 'supabase' | 'none';
export type HostAxis = 'vercel' | 'dokploy';
export type AuthAxis = 'better-auth' | 'supabase-auth' | 'none';
export type AuthMode = 'internal' | 'client';
export type StorageAxis = 'r2' | 'supabase' | 'none';
export type Visibility = 'internal' | 'client';
export type PresetId = 'turso' | 'postgres' | 'sqlite' | 'supabase' | 'static';

/** Which `*.pg.*` / `*.sqlite.*` sibling survives dialect resolution. */
export type Dialect = 'pg' | 'sqlite' | 'none';

/**
 * Selector groups for suffix resolution. Generalised from the spec's dialect
 * rule so `authMode` gets a home too: `auth.internal.ts` / `auth.client.ts`
 * resolve exactly like `schema.pg.ts` / `schema.sqlite.ts`.
 */
export const SELECTOR_GROUPS = {
	dialect: ['pg', 'sqlite'],
	authMode: ['internal', 'client'],
	/**
	 * Lets a feature ship a storage-aware and a storage-free version of the same
	 * module. Needed because `has.storage` is a literal type: it can hide markup,
	 * but it cannot make an import of a module that wasn't copied resolve.
	 */
	storage: ['r2', 'supabase', 'none']
} as const satisfies Record<string, readonly string[]>;

export type SelectorGroup = keyof typeof SELECTOR_GROUPS;

export interface Manifest {
	name: string;
	slug: string;
	description: string;
	visibility: Visibility;
	preset: PresetId;
	data: DataAxis;
	host: HostAxis;
	auth: AuthAxis;
	authMode: AuthMode;
	organizations: boolean;
	storage: StorageAxis;
	email: boolean;
	admin: boolean;
	example: boolean;
	runtime: { node: number };
	deployment: {
		provider: HostAxis;
		replicas: number;
		productionUrl: string;
	};
	generated?: GeneratedStamp;
}

export interface GeneratedStamp {
	at: string;
	starterVersion: string;
	starterCommit: string;
	profile: string;
	variants: string[];
	planDigest: string;
}

/**
 * Fixed application order. Never derive this from `readdir`, `Object.keys` or
 * `Set` insertion — determinism depends on it being a literal. A structural test
 * asserts it matches `variants/` exactly, so a new directory can't be forgotten.
 */
export const VARIANT_ORDER = [
	'db-drizzle-turso',
	'db-drizzle-postgres',
	'db-sqlite-extras',
	'db-supabase',
	'auth-better',
	'auth-supabase',
	'orgs',
	'storage-r2',
	'storage-supabase',
	'admin-better',
	'admin-supabase',
	'example-drizzle',
	'example-supabase',
	'static-mode',
	'host-vercel',
	'host-dokploy'
] as const;

export type VariantId = (typeof VARIANT_ORDER)[number];

export interface Capabilities {
	db: boolean;
	auth: boolean;
	organizations: boolean;
	storage: boolean;
	email: boolean;
	admin: boolean;
	example: boolean;
}

/** Everything derived from the manifest, computed once so nothing re-derives it. */
export interface ResolvedManifest {
	manifest: Omit<Manifest, 'generated'>;
	profile: string;
	dialect: Dialect;
	adapter: 'vercel' | 'node';
	capabilities: Capabilities;
	variants: VariantId[];
	tokens: Readonly<Record<TokenName, string>>;
}

export type TokenName =
	| 'APP_NAME'
	| 'APP_SLUG'
	| 'APP_DESCRIPTION'
	| 'APP_URL'
	| 'PROFILE'
	| 'NODE_VERSION'
	| 'REPLICAS'
	| 'DRIZZLE_DIALECT';

// ─── variant.json ────────────────────────────────────────────────────────────

export interface EnvEntry {
	name: string;
	required: boolean;
	note?: string;
	example?: string;
}

export interface RegistryDeclaration {
	/** Exported symbol to import. */
	name: string;
	/** Module specifier, e.g. `$lib/server/auth/hook`. */
	from: string;
	/** Lower sorts earlier in the assembled array. */
	order: number;
}

export interface VariantManifest {
	description?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	env?: EnvEntry[];
	/** Base paths this variant deletes. */
	remove?: string[];
	/**
	 * Base paths this variant intentionally overwrites. Writing over a base file
	 * without declaring it here is an error, and declaring a path that no longer
	 * exists in base is also an error — that second check is what catches a base
	 * rename that would otherwise silently orphan the override.
	 */
	replaces?: string[];
	registries?: {
		hooks?: RegistryDeclaration[];
		health?: RegistryDeclaration[];
		nav?: RegistryDeclaration[];
	};
}

// ─── file operations ─────────────────────────────────────────────────────────

export type RepoPath = string;

export type FileOp =
	| { kind: 'remove'; path: RepoPath; reason: string }
	| { kind: 'removeDir'; path: RepoPath; reason: string }
	| {
			kind: 'copy';
			from: RepoPath;
			to: RepoPath;
			variant: VariantId;
			replacesBase: boolean;
			/** Set when the destination came from resolving a `*.pg.ts`-style suffix. */
			selector?: { group: SelectorGroup; value: string };
	  }
	| { kind: 'generate'; to: RepoPath; generator: GeneratorId }
	/** Self-erasure. Must run after every copy, hence its own terminal phase. */
	| { kind: 'prune'; path: RepoPath; recursive: boolean; reason: string };

export type GeneratorId =
	| 'app-config'
	| 'env-module'
	| 'env-example'
	| 'package-json'
	| 'svelte-config'
	| 'registry:hooks'
	| 'registry:health'
	| 'registry:nav'
	/**
	 * The Drizzle schema barrel. Same collision problem as the hook registry —
	 * db, auth, storage and the example feature all contribute tables — so it is
	 * derived from the plan's own copy list rather than owned by any variant.
	 */
	| 'db-schema';

/**
 * Phase ordering. Variant-declared removals precede copies so remove/copy always
 * commute; prune is strictly last because it deletes the very trees the copies
 * read from.
 */
export const OP_PHASE: Record<FileOp['kind'], number> = {
	remove: 0,
	removeDir: 1,
	copy: 2,
	generate: 3,
	prune: 4
};

// ─── plan ────────────────────────────────────────────────────────────────────

export interface EnvSection {
	title: string;
	source: VariantId | 'core';
	vars: EnvEntry[];
}

export interface PackageMerge {
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
	scripts: Record<string, string>;
	removedDeps: string[];
	removedScripts: string[];
}

export interface RegistryEntry extends RegistryDeclaration {
	registry: 'hooks' | 'health' | 'nav';
	source: VariantId | 'base';
}

export interface Plan {
	resolved: ResolvedManifest;
	ops: FileOp[];
	packageJson: PackageMerge;
	env: EnvSection[];
	registries: RegistryEntry[];
	warnings: string[];
}

// ─── errors ──────────────────────────────────────────────────────────────────

export interface ConfigureError {
	code: string;
	/** Legality rule number from the spec (§3), when it is one. */
	rule?: number;
	message: string;
	/** 1-based line in niftic.app.yml, when we can point at one. */
	line?: number;
	why?: string;
	fix?: string[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: ConfigureError[] };
