import type { GeneratorId, Plan, RegistryEntry } from './types';

/**
 * The file generators.
 *
 * Everything with structure or ordering is emitted by a function here rather
 * than by substituting into a template, so it is typed and unit-testable and
 * there is no escaping ambiguity. Plain token substitution is reserved for files
 * that a variant ships whole and only needs to personalise.
 *
 * Every generator returns text ending in exactly one newline. Output is run
 * through Prettier afterwards, which is what makes a configured app look
 * hand-written rather than emitted.
 */

const banner = (extra?: string) =>
	`// Generated during project setup. Edit freely — nothing regenerates it.${
		extra ? `\n// ${extra}` : ''
	}\n`;

function jsString(value: string): string {
	return JSON.stringify(value);
}

// ─── src/lib/app-config.ts ───────────────────────────────────────────────────

function appConfig(plan: Plan): string {
	const { manifest, profile, capabilities } = plan.resolved;

	return `${banner()}
export const appConfig = {
	name: ${jsString(manifest.slug)},
	title: ${jsString(manifest.name)},
	description: ${jsString(manifest.description)},
	profile: ${jsString(profile)},
	data: ${jsString(manifest.data)},
	host: ${jsString(manifest.host)},
	auth: ${jsString(manifest.auth)},
	authMode: ${jsString(manifest.authMode)},
	storage: ${jsString(manifest.storage)}
} as const;

/**
 * Capability flags.
 *
 * For RENDERING only — nav labels, settings sections, the health payload. These
 * are not a guard for importing a module that may not exist: \`if (has.db)\` will
 * not make an unresolvable import legal. Module existence was decided at setup.
 *
 * Keep \`as const\`. Widening to Record<string, boolean> destroys the literal
 * types and with them the dead-branch elimination this relies on.
 */
export const has = {
	db: ${capabilities.db},
	auth: ${capabilities.auth},
	organizations: ${capabilities.organizations},
	storage: ${capabilities.storage},
	email: ${capabilities.email},
	admin: ${capabilities.admin},
	example: ${capabilities.example}
} as const;

/**
 * Annotated \`boolean\`, not inferred as a literal, so \`{#if !isConfigured}\`
 * stays a legal question to ask rather than becoming a type error.
 */
export const isConfigured: boolean = true;

export type AppConfig = typeof appConfig;
export type Capability = keyof typeof has;
`;
}

// ─── src/lib/server/env.ts ───────────────────────────────────────────────────

function envModule(plan: Plan): string {
	const seen = new Map<string, { required: boolean; note?: string }>();
	for (const section of plan.env) {
		for (const entry of section.vars) {
			// PUBLIC_ variables are not in this module's world. SvelteKit excludes
			// anything carrying the public prefix from `$env/dynamic/private` by
			// design, so a PUBLIC_ field here can never be satisfied: validation
			// fails on every request that touches env, no matter what the operator
			// sets. They are read through `$env/dynamic/public` instead — on the
			// server as well as in the browser — and still appear in .env.example,
			// which is assembled from `plan.env` rather than from this list.
			if (entry.name.startsWith('PUBLIC_')) continue;
			// First declaration wins; sections are already in deterministic order.
			if (!seen.has(entry.name)) {
				seen.set(entry.name, { required: entry.required, note: entry.note });
			}
		}
	}

	const fields = [...seen.entries()]
		.map(([name, { required, note }]) => {
			const rule = required ? 'z.string().min(1)' : 'z.string().optional()';
			return `${note ? `\t/** ${note} */\n` : ''}\t${name}: ${rule}`;
		})
		.join(',\n');

	return `${banner()}//
// Two deliberate choices here, both load-bearing:
//
// 1. \`$env/dynamic/private\`, not \`$env/static/private\`. Static env inlines at
//    build time and fails the build when a var is absent, so CI could never run
//    \`pnpm build\` without a full set of real secrets. Dynamic env reads at
//    runtime, which is also what a container needs: build the image once, supply
//    env per deployment.
//
// 2. Validation is lazy and memoised. A top-level parse() runs during SSR module
//    initialisation — i.e. during \`vite build\` and prerendering — and would crash
//    for the same reason. env() throws on first real use instead.

import { env as runtime } from '$env/dynamic/private';
import { z } from 'zod';

const schema = z.object({
${fields}
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
	if (cached) return cached;

	const parsed = schema.safeParse(runtime);
	if (!parsed.success) {
		const detail = parsed.error.issues
			.map((issue) => \`  \${issue.path.join('.') || '(root)'}: \${issue.message}\`)
			.join('\\n');
		// Names only — never echo values, this can reach a log aggregator.
		throw new Error(\`Invalid environment configuration:\\n\${detail}\`);
	}

	cached = parsed.data;
	return cached;
}
`;
}

// ─── .env.example ────────────────────────────────────────────────────────────

function envExample(plan: Plan): string {
	const lines: string[] = [
		`# Environment for ${plan.resolved.manifest.name} (${plan.resolved.profile} profile).`,
		'#',
		'# Copy to .env and fill in. Never commit .env.',
		'# Preview deployments MUST NOT share production resources: separate database,',
		'# separate auth secret, separate bucket — or uploads disabled entirely.',
		''
	];

	for (const section of plan.env) {
		lines.push(`# ── ${section.title} ${'─'.repeat(Math.max(0, 60 - section.title.length))}`);
		for (const entry of section.vars) {
			if (entry.note) lines.push(`# ${entry.note}`);
			if (!entry.required) lines.push('# optional');
			lines.push(`${entry.name}=${entry.example ?? ''}`);
		}
		lines.push('');
	}

	return lines.join('\n').replace(/\n+$/, '\n');
}

// ─── package.json ────────────────────────────────────────────────────────────

const PKG_KEY_ORDER = [
	'name',
	'version',
	'private',
	'type',
	'description',
	'packageManager',
	'engines',
	'pnpm',
	'scripts',
	'dependencies',
	'devDependencies'
];

function packageJson(plan: Plan, basePackage: Record<string, unknown>): string {
	const { manifest } = plan.resolved;

	const merged: Record<string, unknown> = {
		...basePackage,
		name: manifest.slug,
		version: '0.1.0',
		private: true,
		description: manifest.description,
		scripts: plan.packageJson.scripts,
		dependencies: plan.packageJson.dependencies,
		devDependencies: plan.packageJson.devDependencies
	};

	// The engine's own bookkeeping never reaches a generated app.
	delete merged.niftic;

	const ordered: Record<string, unknown> = {};
	for (const key of PKG_KEY_ORDER) {
		if (key in merged) ordered[key] = merged[key];
	}
	for (const key of Object.keys(merged).sort()) {
		if (!(key in ordered)) ordered[key] = merged[key];
	}

	return `${JSON.stringify(ordered, null, 2)}\n`;
}

// ─── svelte.config.js ────────────────────────────────────────────────────────

function svelteConfig(plan: Plan): string {
	const { adapter, manifest } = plan.resolved;

	if (adapter === 'vercel') {
		return `import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The Node runtime is NOT pinned here on purpose. adapter-vercel's \`runtime\`
 * option is deprecated upstream; the Node version comes from \`engines.node\` and
 * the Vercel project settings instead. Never the edge runtime — libSQL,
 * postgres-js and service keys all want Node.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
`;
	}

	return `import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Dokploy host: a long-lived Node process behind the platform's proxy.
 * Listens on PORT/HOST. Replicas must stay at ${manifest.deployment.replicas}.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
`;
}

// ─── registries ──────────────────────────────────────────────────────────────

function registryModule(
	entries: RegistryEntry[],
	options: {
		registry: RegistryEntry['registry'];
		typeName: string;
		typeFrom: string;
		exportName: string;
		note: string;
	}
): string {
	const mine = entries.filter((e) => e.registry === options.registry);

	// Group imports by module so the block reads like something a person wrote.
	const byModule = new Map<string, string[]>();
	for (const entry of mine) {
		const names = byModule.get(entry.from) ?? [];
		names.push(entry.name);
		byModule.set(entry.from, names);
	}

	const imports = [...byModule.entries()]
		.map(([from, names]) => `import { ${names.join(', ')} } from '${from}';`)
		.join('\n');

	const items = mine.map((e) => `\t${e.name}`).join(',\n');

	return `${banner(options.note)}
import type { ${options.typeName} } from '${options.typeFrom}';
${imports}

export const ${options.exportName}: ${options.typeName}[] = [
${items}
];
`;
}

// ─── drizzle schema barrel ───────────────────────────────────────────────────

const SCHEMA_DIR = 'src/lib/server/db/schema/';

/**
 * Derived from the plan's copy list rather than declared, so a variant that adds
 * a table file is wired up by the act of shipping it. `drizzle()` needs the whole
 * schema object for relational queries, which is why the barrel exists at all.
 */
function dbSchema(plan: Plan): string {
	const modules = plan.ops
		.filter(
			(op) =>
				op.kind === 'copy' &&
				op.to.startsWith(SCHEMA_DIR) &&
				op.to.endsWith('.ts') &&
				op.to !== `${SCHEMA_DIR}index.ts`
		)
		.map((op) => (op.kind === 'copy' ? op.to.slice(SCHEMA_DIR.length).replace(/\.ts$/, '') : ''))
		.sort();

	const body =
		modules.length > 0
			? modules.map((name) => `export * from './${name}';`).join('\n')
			: '// No tables yet — the first feature variant adds one.\nexport {};';

	return `${banner('Re-exports every table so drizzle() sees the full schema.')}
${body}
`;
}

// ─── AGENTS.md ───────────────────────────────────────────────────────────────

/**
 * The generated app's orientation page: one screen of stack, commands and layout,
 * pointing at the guide for everything else.
 *
 * `AGENTS.md` and not `CLAUDE.md`, because every agent but one finds this name by
 * convention and the one that doesn't gets a pointer. One file, one copy of each
 * rule, whichever tool is reading.
 *
 * The commands come from the merged package.json rather than a hand-kept list,
 * because a file that names a script the app does not have is worse than no file
 * at all — the agent runs it, it fails, and the page loses its authority for
 * everything else on it.
 */
function agentsMd(plan: Plan): string {
	const { manifest, profile, capabilities, dialect } = plan.resolved;

	const stack: string[] = [
		'SvelteKit 2 + Svelte 5 (runes only), TypeScript strict, Tailwind v4 (no config',
		'file — tokens live in `src/app.css`), Zod 4 + sveltekit-superforms, Vitest,',
		'Playwright. pnpm, Node 24.'
	];

	const line = (label: string, value: string) => `- **${label}** — ${value}`;
	const profileLines: string[] = [];
	if (manifest.data === 'turso') profileLines.push(line('Data', 'Turso (libSQL) through Drizzle'));
	if (manifest.data === 'postgres')
		profileLines.push(
			line('Data', 'Postgres through Drizzle and postgres-js, pooled connections only')
		);
	if (manifest.data === 'sqlite')
		profileLines.push(line('Data', 'SQLite on a volume through Drizzle, replicated by Litestream'));
	if (manifest.data === 'supabase')
		profileLines.push(
			line('Data', 'Supabase Postgres, reached through supabase-js and policed by RLS')
		);
	if (manifest.data === 'none')
		profileLines.push(line('Data', 'none. Every page is prerendered at build time'));

	if (manifest.auth === 'better-auth')
		profileLines.push(
			line('Auth', `Better Auth, ${manifest.authMode} mode (\`src/lib/server/auth/\`)`)
		);
	if (manifest.auth === 'supabase-auth')
		profileLines.push(line('Auth', `Supabase Auth, ${manifest.authMode} mode`));
	if (capabilities.organizations)
		profileLines.push(
			line('Tenancy', 'organizations — every scoped query is filtered by membership')
		);
	if (manifest.storage !== 'none')
		profileLines.push(
			line(
				'Storage',
				`${manifest.storage === 'r2' ? 'Cloudflare R2' : 'Supabase Storage'} behind the storage port, signed URLs only`
			)
		);
	if (capabilities.email) profileLines.push(line('Email', 'Resend behind `sendEmail()`'));
	profileLines.push(line('Host', manifest.host === 'vercel' ? 'Vercel' : 'Dokploy'));

	// Aligned pairs rather than hand-spaced strings: the descriptions differ per
	// profile, so the column has to be computed or it drifts on every branch.
	const paths: [string, string][] = [
		['src/lib/components/', 'hand-rolled UI primitives — this is the component library'],
		['src/lib/app-config.ts', "this app's profile and capability flags"]
	];
	if (capabilities.db && dialect !== 'none')
		paths.push(['src/lib/server/db/', 'schema, client, and the repository layer']);
	if (manifest.data === 'supabase') {
		paths.push(['src/lib/server/supabase/', 'the USER-scoped client — subject to RLS']);
		paths.push(['src/lib/server/admin/', 'the service-role client — bypasses RLS']);
		paths.push(['supabase/migrations/', 'every table needs RLS and explicit policies']);
	}
	paths.push([
		'src/routes/',
		`(site) public · (app) authed${capabilities.admin ? ' · admin' : ''} · api`
	]);

	const column = Math.max(...paths.map(([p]) => p.length)) + 2;
	const layout = paths.map(([p, description]) => p.padEnd(column) + description);

	const rules: string[] = [
		'- Mutations go through SvelteKit form actions with Zod validation. Authorization',
		'  is re-checked server-side in every action — never trust a hidden field or a',
		'  client-side guard.',
		'- Never call a database, Resend, R2, or any service key from browser code.'
	];
	// One bullet, so the sentence about enforcement cannot drift away from the
	// boundaries it is about.
	const boundaries: string[] = [];
	if (capabilities.email) boundaries.push('All email goes through `sendEmail()`.');
	if (manifest.storage !== 'none')
		boundaries.push('All uploads go through the storage port and signed URLs.');
	if (boundaries.length > 0) {
		rules.push(
			`- ${boundaries.join(' ')} ESLint enforces ${boundaries.length > 1 ? 'both' : 'that'} boundar${boundaries.length > 1 ? 'ies' : 'y'}.`
		);
	}
	rules.push('- Typed env comes from `$lib/server/env`. `process.env` is banned elsewhere.');
	if (capabilities.db) rules.push('- Migrations are always committed.');
	if (manifest.data === 'supabase')
		rules.push(
			'- No table without row level security and explicit policies. Regenerate',
			'  `src/lib/database.types.ts` after every schema change.'
		);
	rules.push(
		'- Never add a second auth library, ORM, validation library, or a component',
		'  library. The primitives in `src/lib/components/` are the component library.',
		'- Never print or commit credentials.'
	);

	const scripts = Object.entries(plan.packageJson.scripts).filter(([name]) => name !== 'prepare');
	const scriptColumn = Math.max(...scripts.map(([name]) => name.length)) + 1;
	const commands = scripts.map(([name, body]) => `pnpm ${name.padEnd(scriptColumn)} # ${body}`);

	return `# ${manifest.name}

${manifest.description}

Generated from [niftic-app-starter](https://github.com/Niftic-Agency/niftic-app-starter) —
the **${profile}** profile.

Workflows for adding anything — a resource, a role, an admin screen, an upload,
an email — live in [.agents/niftic-app/GUIDE.md](.agents/niftic-app/GUIDE.md).
Read that before adding features, whichever agent you are. Claude Code reaches
it through the \`niftic-app\` skill, which points at the same file; \`CLAUDE.md\`
points at this one. Every rule has exactly one home.

## Stack

${stack.join('\n')}

${profileLines.join('\n')}

## Commands

\`\`\`
${commands.join('\n')}
\`\`\`

## Where things live

\`\`\`
${layout.join('\n')}
\`\`\`

## Rules that hold everywhere

${rules.join('\n')}

## Honesty about verification

"Verified" in a commit message must mean you actually ran it. If you checked the
code but not the running app, write "verified in code, not in browser".
`;
}

// ─── CLAUDE.md ───────────────────────────────────────────────────────────────

/**
 * A pointer, not a page.
 *
 * Claude Code looks for this filename; every other agent looks for `AGENTS.md`.
 * Writing the orientation twice would mean maintaining it twice, and the copy
 * nobody edits is the one that eventually lies — so this file's whole job is to
 * send the reader one directory over.
 */
function claudeMd(plan: Plan): string {
	return `# ${plan.resolved.manifest.name}

Read [AGENTS.md](AGENTS.md). It is the orientation for this app and it is not
Claude-specific — stack, commands, layout, and the rules that hold everywhere.

Workflows for adding anything live in
[.agents/niftic-app/GUIDE.md](.agents/niftic-app/GUIDE.md), which the
\`niftic-app\` skill points at too.

This file exists only because Claude Code looks for this name. Everything it
would say is in the two files above, deliberately once.
`;
}

// ─── README.md ───────────────────────────────────────────────────────────────

/**
 * The human's first screen, and the third file that would otherwise arrive still
 * describing the template it came from — a repo whose README opens "a template
 * that produces every kind of app" teaches everyone who clones it the wrong
 * thing about what they are holding.
 *
 * Short on purpose. AGENTS.md carries the rules and the layout; duplicating them
 * here would mean two files to keep true.
 */
function readme(plan: Plan): string {
	const { manifest, profile, capabilities } = plan.resolved;
	const has = (name: string) => name in plan.packageJson.scripts;

	const start = ['pnpm install', 'cp .env.example .env   # then fill it in'];
	if (has('db:migrate')) start.push('pnpm db:migrate');
	if (has('db:seed')) start.push('pnpm db:seed');
	if (has('db:start')) start.push('pnpm db:start          # the local Supabase stack');
	if (has('db:reset')) start.push('pnpm db:reset');
	start.push('pnpm dev');

	const docs = ['- [AGENTS.md](AGENTS.md) — stack, commands, layout, and the rules that hold.'];
	docs.push(
		'- [.agents/niftic-app/GUIDE.md](.agents/niftic-app/GUIDE.md) — how to add a\n  resource, a role, an upload, an email.'
	);
	if (manifest.host === 'dokploy')
		docs.push('- [docs/deploy-dokploy.md](docs/deploy-dokploy.md) — the deploy runbook.');
	if (manifest.data === 'postgres')
		docs.push('- [docs/postgres-pooling.md](docs/postgres-pooling.md) — connection rules.');
	if (manifest.data === 'sqlite')
		docs.push(
			'- [docs/sqlite-litestream.md](docs/sqlite-litestream.md) — replication and\n  the restore drill.'
		);

	return `# ${manifest.name}

${manifest.description}

## Getting started

\`\`\`bash
${start.join('\n')}
\`\`\`

\`.env.example\` lists every variable this app needs, with a note on each.
${capabilities.email ? 'Set `EMAIL_DRY_RUN=true` locally and mail is logged rather than sent.\n' : ''}
Health is at \`/api/health\`, and it reports each dependency separately.

## Checks

\`\`\`bash
pnpm check && pnpm lint && pnpm test:unit
pnpm test:e2e
\`\`\`

## Where to read next

${docs.join('\n')}

---

Generated from
[niftic-app-starter](https://github.com/Niftic-Agency/niftic-app-starter) — the
**${profile}** profile.
`;
}

// ─── dispatch ────────────────────────────────────────────────────────────────

export function generate(
	id: GeneratorId,
	plan: Plan,
	basePackage: Record<string, unknown>
): string {
	switch (id) {
		case 'app-config':
			return appConfig(plan);
		case 'env-module':
			return envModule(plan);
		case 'env-example':
			return envExample(plan);
		case 'package-json':
			return packageJson(plan, basePackage);
		case 'svelte-config':
			return svelteConfig(plan);
		case 'db-schema':
			return dbSchema(plan);
		case 'agents-md':
			return agentsMd(plan);
		case 'claude-md':
			return claudeMd(plan);
		case 'readme':
			return readme(plan);
		case 'registry:hooks':
			return registryModule(plan.registries, {
				registry: 'hooks',
				typeName: 'Handle',
				typeFrom: '@sveltejs/kit',
				exportName: 'handles',
				note: 'Order matters: request id first, then auth, then anything that reads the session.'
			});
		case 'registry:health':
			return registryModule(plan.registries, {
				registry: 'health',
				typeName: 'HealthCheck',
				typeFrom: '$lib/server/health',
				exportName: 'checks',
				note: 'Checks must be cheap and must never mutate — uptime monitors hit this often.'
			});
		case 'registry:nav':
			return registryModule(plan.registries, {
				registry: 'nav',
				typeName: 'NavItem',
				typeFrom: '$lib/nav',
				exportName: 'navItems',
				note: 'Contributed by variants so no single variant owns the layout.'
			});
	}
}
