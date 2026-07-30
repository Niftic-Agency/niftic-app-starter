import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { TreeIndex, VariantEntry } from './plan';
import { generate } from './generate';
import { VARIANT_ORDER, type Plan, type VariantId, type VariantManifest } from './types';

/**
 * Effects. Everything that touches the filesystem lives here, behind `FsIo` so
 * the planner stays pure and testable.
 *
 * Every path is resolved against a single `root` captured once, and asserted to
 * stay under it. A relative path resolved against `process.cwd()` instead of the
 * target root is the classic way an engine like this scribbles on the repo it
 * was launched from; the assertion turns that into an immediate error.
 */

export interface FsIo {
	read(rel: string): Promise<string>;
	write(rel: string, contents: string): Promise<void>;
	copy(from: string, to: string): Promise<void>;
	remove(rel: string): Promise<void>;
	removeDir(rel: string): Promise<void>;
	exists(rel: string): boolean;
}

export function nodeIo(root: string): FsIo {
	const resolve = (rel: string): string => {
		const full = path.resolve(root, rel);
		if (full !== root && !full.startsWith(root + path.sep)) {
			throw new Error(`refusing to touch "${rel}": resolves outside the project root`);
		}
		return full;
	};

	return {
		async read(rel) {
			return fs.readFile(resolve(rel), 'utf8');
		},
		async write(rel, contents) {
			const full = resolve(rel);
			await fs.mkdir(path.dirname(full), { recursive: true });
			// Always LF, always exactly one trailing newline.
			const normalised = contents.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
			await fs.writeFile(full, normalised, 'utf8');
		},
		async copy(from, to) {
			const target = resolve(to);
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.copyFile(resolve(from), target);
		},
		async remove(rel) {
			await fs.rm(resolve(rel), { force: true });
		},
		async removeDir(rel) {
			await fs.rm(resolve(rel), { recursive: true, force: true });
		},
		exists(rel) {
			return existsSync(resolve(rel));
		}
	};
}

// ─── reading the tree ────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'.svelte-kit',
	'build',
	'.vercel',
	'.data',
	'variants',
	'test-results',
	'playwright-report',
	'coverage'
]);

async function walk(dir: string, root: string, out: string[]): Promise<void> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	// Sort before recursing — readdir order is not guaranteed and determinism
	// starts here.
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	for (const entry of entries) {
		if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) await walk(full, root, out);
		else out.push(path.relative(root, full).split(path.sep).join('/'));
	}
}

export async function readTree(root: string): Promise<TreeIndex> {
	const basePaths: string[] = [];
	await walk(root, root, basePaths);

	const basePackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

	const variants: Partial<Record<VariantId, VariantEntry>> = {};
	for (const id of VARIANT_ORDER) {
		const dir = path.join(root, 'variants', id);
		const manifestPath = path.join(dir, 'variant.json');
		if (!existsSync(manifestPath)) continue;

		const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as VariantManifest;
		const files: string[] = [];
		await walk(dir, dir, files);

		variants[id] = {
			manifest,
			// variant.json is metadata, not payload.
			files: files.filter((f) => f !== 'variant.json')
		};
	}

	return { basePaths, variants, basePackage };
}

// ─── formatting ──────────────────────────────────────────────────────────────

const FORMATTABLE = new Set(['.ts', '.js', '.json', '.svelte', '.css', '.md']);

/**
 * Run the repo's own Prettier over generated output. This is the step that makes
 * a configured app look hand-built instead of emitted, and it is why `prettier`
 * is pinned exactly — a patch release that changes formatting would break
 * byte-identity between two runs of the same manifest.
 */
async function formatGenerated(root: string, files: string[]): Promise<void> {
	const prettier = await import('prettier');

	for (const rel of files) {
		if (!FORMATTABLE.has(path.extname(rel))) continue;
		const full = path.join(root, rel);
		if (!existsSync(full)) continue;

		const source = await fs.readFile(full, 'utf8');
		const options = await prettier.resolveConfig(full);
		const formatted = await prettier.format(source, { ...options, filepath: full });
		await fs.writeFile(full, formatted, 'utf8');
	}
}

// ─── applying ────────────────────────────────────────────────────────────────

export interface ApplyResult {
	written: string[];
	removed: string[];
}

export async function applyPlan(
	plan: Plan,
	io: FsIo,
	root: string,
	basePackage: Record<string, unknown>
): Promise<ApplyResult> {
	const written: string[] = [];
	const removed: string[] = [];

	// Ops are already phase-ordered: removes, then removeDirs, then copies, then
	// generates. Destructive prune ops sort last, so a crash mid-run leaves the
	// engine intact and `git checkout . && git clean -fd` recovers.
	for (const op of plan.ops) {
		switch (op.kind) {
			case 'remove':
				await io.remove(op.path);
				removed.push(op.path);
				break;
			case 'removeDir':
				await io.removeDir(op.path);
				removed.push(`${op.path}/`);
				break;
			case 'copy':
				await io.copy(op.from, op.to);
				written.push(op.to);
				break;
			case 'generate':
				await io.write(op.to, generate(op.generator, plan, basePackage));
				written.push(op.to);
				break;
			case 'prune':
				if (op.recursive) await io.removeDir(op.path);
				else await io.remove(op.path);
				removed.push(op.recursive ? `${op.path}/` : op.path);
				break;
		}
	}

	await formatGenerated(root, written);

	return { written, removed };
}
