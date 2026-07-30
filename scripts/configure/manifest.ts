import { LineCounter, parseDocument, type Document } from 'yaml';
import { z } from 'zod';
import type {
	AuthAxis,
	ConfigureError,
	DataAxis,
	HostAxis,
	Manifest,
	PresetId,
	Result,
	StorageAxis
} from './types';

/**
 * Manifest schema, preset defaults, and the legality rules from spec §3.
 *
 * The rules are the part of this engine with the most spec content and the least
 * churn, so they live in one place with their reasoning attached. Every rule
 * carries a `why` (the physical constraint behind it) and at least one concrete
 * `fix`, because "invalid configuration" tells a user nothing they can act on.
 */

// ─── schema ──────────────────────────────────────────────────────────────────

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export const manifestSchema = z.object({
	name: z.string().min(1, 'is required').max(80),
	slug: z
		.string()
		.regex(
			slugPattern,
			'must be lowercase letters, digits and hyphens (it becomes a package name, a bucket name and a subdomain)'
		),
	// Kept free of characters that would need escaping wherever it gets injected.
	description: z
		.string()
		.max(160)
		.refine((v) => !/[\n`<]|\$\{/.test(v), {
			message: 'must not contain newlines, backticks, `<`, or `${`'
		})
		.default(''),
	visibility: z.enum(['internal', 'client']).default('client'),
	preset: z.enum(['turso', 'postgres', 'sqlite', 'supabase', 'static']),

	data: z.enum(['turso', 'sqlite', 'postgres', 'supabase', 'none']).optional(),
	host: z.enum(['vercel', 'dokploy']).optional(),
	auth: z.enum(['better-auth', 'supabase-auth', 'none']).optional(),
	authMode: z.enum(['internal', 'client']).optional(),
	organizations: z.boolean().optional(),
	storage: z.enum(['r2', 'supabase', 'none']).optional(),
	email: z.boolean().optional(),
	admin: z.boolean().optional(),
	example: z.boolean().optional(),

	runtime: z.object({ node: z.literal(24).default(24) }).default({ node: 24 }),

	deployment: z
		.object({
			provider: z.enum(['vercel', 'dokploy']).optional(),
			replicas: z.number().int().positive().default(1),
			productionUrl: z.string().default('')
		})
		.default({ replicas: 1, productionUrl: '' }),

	generated: z
		.object({
			at: z.string(),
			starterVersion: z.string(),
			starterCommit: z.string(),
			profile: z.string(),
			variants: z.array(z.string()),
			planDigest: z.string()
		})
		.optional()
});

export type RawManifest = z.infer<typeof manifestSchema>;

// ─── presets ─────────────────────────────────────────────────────────────────

interface PresetDefaults {
	data: DataAxis;
	host: HostAxis;
	auth: AuthAxis;
	storage: StorageAxis;
	admin: boolean;
	example: boolean;
	email: boolean;
}

export const PRESETS: Record<PresetId, PresetDefaults> = {
	turso: {
		data: 'turso',
		host: 'vercel',
		auth: 'better-auth',
		storage: 'r2',
		admin: true,
		example: true,
		email: true
	},
	postgres: {
		data: 'postgres',
		host: 'vercel',
		auth: 'better-auth',
		storage: 'r2',
		admin: true,
		example: true,
		email: true
	},
	sqlite: {
		data: 'sqlite',
		host: 'dokploy',
		auth: 'better-auth',
		storage: 'r2',
		admin: true,
		example: true,
		email: true
	},
	supabase: {
		data: 'supabase',
		host: 'vercel',
		auth: 'supabase-auth',
		storage: 'supabase',
		admin: true,
		example: true,
		email: true
	},
	static: {
		data: 'none',
		host: 'vercel',
		auth: 'none',
		storage: 'none',
		admin: false,
		example: false,
		email: true
	}
};

/** Fill unset axes from the preset. Explicit values always win. */
export function applyPresetDefaults(raw: RawManifest): Manifest {
	const preset = PRESETS[raw.preset];
	const host = raw.host ?? preset.host;

	return {
		name: raw.name,
		slug: raw.slug,
		description: raw.description,
		visibility: raw.visibility,
		preset: raw.preset,
		data: raw.data ?? preset.data,
		host,
		auth: raw.auth ?? preset.auth,
		authMode: raw.authMode ?? 'client',
		organizations: raw.organizations ?? false,
		storage: raw.storage ?? preset.storage,
		email: raw.email ?? preset.email,
		admin: raw.admin ?? preset.admin,
		example: raw.example ?? preset.example,
		runtime: raw.runtime,
		deployment: {
			provider: raw.deployment.provider ?? host,
			replicas: raw.deployment.replicas,
			productionUrl: raw.deployment.productionUrl
		},
		...(raw.generated ? { generated: raw.generated } : {})
	};
}

// ─── legality ────────────────────────────────────────────────────────────────

type LineLookup = (path: (string | number)[]) => number | undefined;

/**
 * The eight rules from spec §3. Returns every failure, not just the first —
 * fixing one at a time through repeated runs is miserable.
 */
export function checkLegality(m: Manifest, lineOf: LineLookup = () => undefined): ConfigureError[] {
	const errors: ConfigureError[] = [];
	const at = (path: (string | number)[]) => ({ line: lineOf(path) });

	// Rule 1 — local SQLite means one process, one host, one volume.
	if (m.data === 'sqlite') {
		if (m.host !== 'dokploy') {
			errors.push({
				code: 'E_SQLITE_HOST',
				rule: 1,
				message: `data: sqlite requires host: dokploy (got host: ${m.host})`,
				why: 'The SQLite file lives on the container disk. Vercel functions are ephemeral and each invocation may land on a different machine, so there is no disk to keep it on.',
				fix: [
					'set host: dokploy',
					'set data: turso — the same libSQL client, hosted, and it works on Vercel'
				],
				...at(['host'])
			});
		}
		if (m.deployment.replicas !== 1) {
			errors.push({
				code: 'E_SQLITE_REPLICAS',
				rule: 1,
				message: `data: sqlite requires deployment.replicas: 1 (got ${m.deployment.replicas})`,
				why: 'Two processes writing one SQLite file corrupt it, and Litestream assumes a single writer. Never put the file on a network filesystem either.',
				fix: ['set deployment.replicas: 1', 'set data: postgres if you need to scale out'],
				...at(['deployment', 'replicas'])
			});
		}
	}

	// Rule 2 — the Supabase branch is a fork; its data and auth are inseparable.
	if (m.data === 'supabase' && m.auth !== 'supabase-auth') {
		errors.push({
			code: 'E_SUPABASE_AUTH',
			rule: 2,
			message: `data: supabase requires auth: supabase-auth (got auth: ${m.auth})`,
			why: 'RLS policies authorize against auth.uid(), which only exists when Supabase Auth issues the session. Another auth provider would leave every policy evaluating against nothing.',
			fix: ['set auth: supabase-auth', 'choose the turso or postgres preset to use Better Auth'],
			...at(['auth'])
		});
	}
	if (m.auth === 'supabase-auth' && m.data !== 'supabase') {
		errors.push({
			code: 'E_AUTH_SUPABASE_DATA',
			rule: 2,
			message: `auth: supabase-auth requires data: supabase (got data: ${m.data})`,
			why: 'Supabase Auth stores users in the Supabase project it belongs to. Pointing it at another database leaves the session and the data in different places.',
			fix: ['set data: supabase', 'set auth: better-auth'],
			...at(['data'])
		});
	}

	// Rule 3 — keep the fork clean: no R2 on the Supabase branch.
	if (m.data === 'supabase' && m.storage === 'r2') {
		errors.push({
			code: 'E_SUPABASE_R2',
			rule: 3,
			message: 'storage: r2 is not available on the supabase branch',
			why: 'The Supabase branch uses Supabase Storage so uploads are governed by the same RLS policies as everything else. Mixing in R2 means two authorization models in one app.',
			fix: ['set storage: supabase', 'set storage: none to disable uploads'],
			...at(['storage'])
		});
	}

	// Rule 3 (mirror) — the spec states R2-on-supabase explicitly; the converse
	// follows from the same principle and is enforced for the same reason.
	// Supabase Storage signs URLs with the project's own credentials and shares
	// its RLS model, so it is meaningless without the Supabase data branch.
	if (m.storage === 'supabase' && m.data !== 'supabase') {
		errors.push({
			code: 'E_STORAGE_SUPABASE_DATA',
			rule: 3,
			message: `storage: supabase requires data: supabase (got data: ${m.data})`,
			why: 'Supabase Storage lives in the Supabase project and is governed by its RLS policies. On another data branch there is no project to hold the bucket and no policy layer to authorize it.',
			fix: ['set storage: r2', 'set storage: none', 'switch to the supabase preset'],
			...at(['storage'])
		});
	}

	// Rule 4 — orgs are a Better Auth plugin; the Supabase branch is
	// single-tenant-with-roles in v1.
	if (m.organizations && m.auth !== 'better-auth') {
		errors.push({
			code: 'E_ORGS_AUTH',
			rule: 4,
			message: `organizations: true requires auth: better-auth (got auth: ${m.auth})`,
			why: "Memberships, roles and invitations come from Better Auth's organization plugin. There is no equivalent on the other branches in v1.",
			fix: ['set organizations: false', 'choose the turso, postgres or sqlite preset'],
			...at(['organizations'])
		});
	}

	// Rule 5 — static mode. Email survives for the contact endpoint.
	if (m.data === 'none') {
		if (m.auth !== 'none') {
			errors.push({
				code: 'E_STATIC_AUTH',
				rule: 5,
				message: `data: none requires auth: none (got auth: ${m.auth})`,
				why: 'There is no database to keep users or sessions in.',
				fix: ['set auth: none', 'pick a data backend if the site needs accounts'],
				...at(['auth'])
			});
		}
		if (m.storage !== 'none') {
			errors.push({
				code: 'E_STATIC_STORAGE',
				rule: 5,
				message: `data: none requires storage: none (got storage: ${m.storage})`,
				why: 'Uploads are recorded in an uploads table, and a static app has no database to record them in.',
				fix: ['set storage: none'],
				...at(['storage'])
			});
		}
		if (m.admin) {
			errors.push({
				code: 'E_STATIC_ADMIN',
				rule: 5,
				message: 'data: none requires admin: false',
				why: 'The admin shell manages users, roles and settings, none of which exist without a database.',
				fix: ['set admin: false'],
				...at(['admin'])
			});
		}
	}

	// Rule 8 — an unauthenticated admin panel is an open admin panel.
	if (m.admin && m.auth === 'none') {
		errors.push({
			code: 'E_ADMIN_AUTH',
			rule: 8,
			message: 'admin: true requires auth to be enabled',
			why: 'The admin routes are role-guarded. With no auth there is no role to check, so the panel would be world-readable.',
			fix: ['set admin: false', 'set auth: better-auth'],
			...at(['admin'])
		});
	}

	// Consistency: deployment.provider mirrors host (rule 7's bookkeeping half).
	if (m.deployment.provider !== m.host) {
		errors.push({
			code: 'E_PROVIDER_HOST',
			rule: 7,
			message: `deployment.provider (${m.deployment.provider}) must match host (${m.host})`,
			why: 'host picks the adapter; deployment.provider is what the deploy docs and CI read. They cannot disagree.',
			fix: [`set deployment.provider: ${m.host}`],
			...at(['deployment', 'provider'])
		});
	}

	return errors;
}

/**
 * Rule 6 is a documentation rule, not a rejection: a pooled connection string is
 * a runtime property we cannot see at configure time. Surface it loudly instead,
 * and let the generated Postgres client assert it at boot.
 */
export function legalityWarnings(m: Manifest): string[] {
	const warnings: string[] = [];
	if (m.data === 'postgres' && m.host === 'vercel') {
		warnings.push(
			'postgres + vercel: DATABASE_URL must be the pooled PgDog endpoint over TLS, never a direct :5432 host. The generated client sets prepare: false and refuses a direct connection at boot. See docs/postgres-pooling.md.'
		);
	}
	if (m.data === 'sqlite') {
		warnings.push(
			'sqlite: the database file and the app process must share one host and one volume. Never a network filesystem, and never apply a lifecycle deletion rule to the Litestream prefix — it destroys the recovery chain.'
		);
	}
	// The host × data matrix marks these "not in v1". They are a support
	// statement rather than a physical constraint, so they warn rather than fail.
	if (m.data === 'supabase' && m.host === 'dokploy') {
		warnings.push(
			'supabase on dokploy is outside the supported v1 matrix — the branch is built and tested against Vercel only.'
		);
	}
	if (m.data === 'none' && m.host === 'dokploy') {
		warnings.push(
			'a static site on dokploy is outside the supported v1 matrix — static targets Vercel, where the endpoints run as functions and everything else is prerendered.'
		);
	}
	return warnings;
}

// ─── loading ─────────────────────────────────────────────────────────────────

export interface LoadedManifest {
	manifest: Manifest;
	/** Kept so the stamp step can write back without losing the user's comments. */
	doc: Document;
	lineOf: LineLookup;
}

export function loadManifest(source: string): Result<LoadedManifest> {
	const lineCounter = new LineCounter();
	const doc = parseDocument(source, { lineCounter });

	if (doc.errors.length > 0) {
		return {
			ok: false,
			errors: doc.errors.map((e) => ({
				code: 'E_YAML',
				message: e.message,
				line: lineCounter.linePos(e.pos[0]).line
			}))
		};
	}

	const lineOf: LineLookup = (path) => {
		try {
			const node = doc.getIn(path, true) as { range?: [number, number, number] } | undefined;
			return node?.range ? lineCounter.linePos(node.range[0]).line : undefined;
		} catch {
			return undefined;
		}
	};

	const parsed = manifestSchema.safeParse(doc.toJS());
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map((issue) => ({
				code: 'E_SCHEMA',
				message: `${issue.path.join('.') || 'manifest'}: ${issue.message}`,
				line: lineOf(issue.path as (string | number)[])
			}))
		};
	}

	const manifest = applyPresetDefaults(parsed.data);
	const errors = checkLegality(manifest, lineOf);
	if (errors.length > 0) return { ok: false, errors };

	return { ok: true, value: { manifest, doc, lineOf } };
}
