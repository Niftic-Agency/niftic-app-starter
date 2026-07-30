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
