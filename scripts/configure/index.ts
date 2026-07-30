import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, nodeIo, readTree } from './apply';
import { legalityWarnings, loadManifest } from './manifest';
import { buildPlan, resolve as resolveManifest } from './plan';
import { c, confirm } from './prompts';
import type { ConfigureError, Plan } from './types';

/**
 * `pnpm configure` — turn this superset repo into one concrete app.
 *
 * One-way by design. Once `niftic.app.yml` carries a `generated:` block the repo
 * is an app, not a template, and re-running would have to reason about a tree it
 * no longer recognises. `--force` prints the migration path instead of pretending
 * otherwise.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

interface Flags {
	yes: boolean;
	force: boolean;
	dryRun: boolean;
	install: boolean;
	verify: boolean;
	allowDirty: boolean;
	manifestPath: string;
}

function parseFlags(argv: string[]): Flags {
	const has = (name: string) => argv.includes(name);
	const value = (name: string) => {
		const index = argv.indexOf(name);
		return index >= 0 ? argv[index + 1] : undefined;
	};

	return {
		yes: has('--yes') || has('-y'),
		force: has('--force'),
		dryRun: has('--dry-run'),
		install: !has('--no-install'),
		verify: !has('--no-verify') && !has('--no-install'),
		allowDirty: has('--allow-dirty'),
		manifestPath: value('--manifest') ?? 'niftic.app.yml'
	};
}

/** Deterministic timestamp support, so CI can diff two runs with no exclusions. */
function nowIso(): string {
	const epoch = process.env.SOURCE_DATE_EPOCH;
	return new Date(epoch ? Number(epoch) * 1000 : Date.now()).toISOString();
}

/** Stable JSON: keys sorted at every level, so a digest means something. */
function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

function digestOf(plan: Plan): string {
	return createHash('sha256').update(canonical(plan)).digest('hex').slice(0, 16);
}

// ─── reporting ───────────────────────────────────────────────────────────────

function reportErrors(errors: ConfigureError[], manifestPath: string): void {
	const noun = errors.length === 1 ? 'problem' : 'problems';
	console.error(
		`\n${c.red('✗')} ${manifestPath} is not a legal configuration (${errors.length} ${noun}).\n`
	);

	for (const error of errors) {
		const rule = error.rule ? c.dim(`[rule ${error.rule}] `) : '';
		console.error(`  ${c.red('✗')} ${rule}${c.bold(error.message)}`);
		if (error.line) console.error(`      ${c.dim(`${manifestPath}:${error.line}`)}`);
		if (error.why) console.error(`      ${c.dim('why')}  ${error.why}`);
		for (const [index, fix] of (error.fix ?? []).entries()) {
			console.error(`      ${c.dim(index === 0 ? 'fix' : ' or')}  ${fix}`);
		}
		console.error('');
	}
}

function printPlan(plan: Plan): void {
	const { resolved } = plan;
	const m = resolved.manifest;

	console.log(`\n${c.bold(m.name)} ${c.dim(`(${m.slug})`)}`);
	console.log(
		`${c.dim('profile')}   ${resolved.profile}  ${c.dim('·')}  data ${m.data}  ${c.dim('·')}  host ${m.host}  ${c.dim('·')}  auth ${m.auth}${
			m.auth !== 'none' ? ` (${m.authMode})` : ''
		}  ${c.dim('·')}  storage ${m.storage}`
	);
	console.log(`${c.dim('variants')}  ${resolved.variants.join(', ') || c.dim('(none)')}`);

	const counts = plan.ops.reduce<Record<string, number>>((acc, op) => {
		acc[op.kind] = (acc[op.kind] ?? 0) + 1;
		return acc;
	}, {});
	console.log(
		`${c.dim('operations')} ${Object.entries(counts)
			.map(([kind, n]) => `${n} ${kind}`)
			.join(', ')}`
	);

	if (plan.packageJson.removedDeps.length > 0) {
		console.log(`${c.dim('dropping')}  ${plan.packageJson.removedDeps.join(', ')}`);
	}

	const envCount = plan.env.reduce((n, section) => n + section.vars.length, 0);
	console.log(`${c.dim('env vars')}  ${envCount} across ${plan.env.length} groups`);

	for (const warning of plan.warnings) {
		console.log(`\n${c.yellow('!')} ${warning}`);
	}
	console.log('');
}

function printNextSteps(plan: Plan): void {
	const m = plan.resolved.manifest;

	console.log(`\n${c.green('✓')} ${c.bold('Configured.')} This repo is now a ${m.preset} app.\n`);
	console.log(`${c.bold('Next:')}`);
	console.log('  1. cp .env.example .env  — then fill it in.');

	const provisioning: string[] = [];
	if (m.data === 'turso') provisioning.push('Create the Turso database and an auth token.');
	if (m.data === 'postgres')
		provisioning.push('Provision Postgres and take the POOLED PgDog URL (never a direct :5432).');
	if (m.data === 'sqlite')
		provisioning.push('Attach a /data volume on Dokploy and set replicas: 1.');
	if (m.data === 'supabase') provisioning.push('Create the Supabase project; copy URL + keys.');
	if (m.storage === 'r2')
		provisioning.push(`Create the private R2 bucket nf-${m.slug}-prod-assets.`);
	if (m.email) provisioning.push('Add the Resend API key and verify the sending domain.');
	if (m.auth === 'better-auth')
		provisioning.push('Generate BETTER_AUTH_SECRET: openssl rand -base64 32');
	provisioning.push(
		m.host === 'vercel'
			? 'Create the Vercel project. Previews MUST use separate resources from production.'
			: 'Create the Dokploy app from this repo and enable deploy-on-push.'
	);

	for (const [index, step] of provisioning.entries()) {
		console.log(`  ${index + 2}. ${step}`);
	}

	// The first prompt has to match the app that was actually generated — telling
	// a prerendered marketing site to run its first migration is the kind of
	// detail that makes someone distrust everything else on the screen.
	const firstPrompt =
		m.data === 'none'
			? 'fill in the marketing pages and wire up the contact form'
			: 'set up the database and run the first migration';

	console.log(`\n${c.dim('Then ask Claude:')} "${firstPrompt}"\n`);
}

// ─── git guard ───────────────────────────────────────────────────────────────

function worktreeIsDirty(): boolean {
	try {
		const out = execFileSync('git', ['status', '--porcelain'], {
			cwd: ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
		return out.trim().length > 0;
	} catch {
		// Not a git repo — nothing to protect, and nothing to recover with either.
		return false;
	}
}

function currentCommit(): string {
	try {
		return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
			cwd: ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return 'unknown';
	}
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
	const flags = parseFlags(process.argv.slice(2));
	// resolve, not join — so an absolute --manifest path works for testing.
	const manifestFile = path.resolve(ROOT, flags.manifestPath);

	if (!existsSync(manifestFile)) {
		console.error(`${c.red('✗')} ${flags.manifestPath} not found.`);
		return 1;
	}

	const source = await fs.readFile(manifestFile, 'utf8');
	const loaded = loadManifest(source);

	if (!loaded.ok) {
		reportErrors(loaded.errors, flags.manifestPath);
		return 1;
	}

	const { manifest, doc } = loaded.value;

	if (manifest.generated) {
		console.error(`\n${c.yellow('!')} This repo is already configured.`);
		console.error(
			`  ${c.dim('generated')} ${manifest.generated.at} (${manifest.generated.profile}, starter ${manifest.generated.starterCommit})\n`
		);
		if (flags.force) {
			console.error(`${c.bold('Changing profile after generation is a manual migration.')}`);
			console.error('  Re-running configure cannot work: the variant overlays it would need');
			console.error('  were deleted, and your app code has since diverged from the base tree.\n');
			console.error('  To move profiles:');
			console.error('    1. Generate a fresh app from the template with the new manifest.');
			console.error('    2. Port src/routes and src/lib/server/<domain> across.');
			console.error('    3. Re-generate migrations for the new dialect; do not hand-edit them.');
			console.error('    4. Diff .env.example and provision what changed.\n');
		} else {
			console.error(`  Run with ${c.bold('--force')} to see the migration path.\n`);
		}
		return 1;
	}

	if (!flags.allowDirty && !flags.dryRun && worktreeIsDirty()) {
		console.error(`\n${c.red('✗')} Working tree has uncommitted changes.`);
		console.error('  configure rewrites and deletes a lot of files. Commit or stash first so');
		console.error(`  ${c.bold('git checkout . && git clean -fd')} can undo it.`);
		console.error(`  Override with ${c.bold('--allow-dirty')} if you know what you're doing.\n`);
		return 1;
	}

	const tree = await readTree(ROOT);
	const resolved = resolveManifest(manifest);
	const planned = buildPlan(resolved, tree);

	if (!planned.ok) {
		reportErrors(planned.errors, flags.manifestPath);
		return 1;
	}

	const plan = planned.value;
	plan.warnings.push(...legalityWarnings(manifest));
	printPlan(plan);

	if (flags.dryRun) {
		console.log(c.dim('--dry-run: nothing written.\n'));
		return 0;
	}

	if (!flags.yes && !(await confirm('Apply this plan?'))) {
		console.log(c.dim('Aborted. Nothing written.\n'));
		return 1;
	}

	const io = nodeIo(ROOT);
	const result = await applyPlan(plan, io, ROOT, tree.basePackage as Record<string, unknown>);
	console.log(
		`${c.green('✓')} ${result.written.length} files written, ${result.removed.length} removed.`
	);

	// Stamp through the yaml Document so the user's comments survive.
	doc.set('generated', {
		at: nowIso(),
		starterVersion: String((tree.basePackage as { version?: string }).version ?? '0.0.0'),
		starterCommit: currentCommit(),
		profile: resolved.profile,
		variants: resolved.variants,
		planDigest: digestOf(plan)
	});
	await fs.writeFile(manifestFile, doc.toString({ lineWidth: 0 }), 'utf8');

	if (flags.install) {
		console.log(c.dim('\nInstalling dependencies...'));
		// NOT --frozen-lockfile: CI=true makes pnpm default to frozen, and the
		// merged package.json is deliberately a strict subset of the superset lock.
		const install = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], {
			cwd: ROOT,
			stdio: 'inherit'
		});
		if (install.status !== 0) {
			console.error(`${c.red('✗')} pnpm install failed.`);
			return install.status ?? 1;
		}
	}

	if (flags.verify) {
		for (const script of ['check', 'lint', 'test:unit', 'build']) {
			console.log(c.dim(`\n> pnpm ${script}`));
			const run = spawnSync('pnpm', ['run', script], { cwd: ROOT, stdio: 'inherit' });
			if (run.status !== 0) {
				console.error(
					`\n${c.red('✗')} pnpm ${script} failed. A preset that cannot pass its own smoke is a bug in the starter.`
				);
				return run.status ?? 1;
			}
		}
	}

	printNextSteps(plan);
	return 0;
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(`\n${c.red('✗')} configure crashed:`);
		console.error(error);
		console.error(`\nRecover with: ${c.bold('git checkout . && git clean -fd')}\n`);
		process.exit(1);
	}
);
