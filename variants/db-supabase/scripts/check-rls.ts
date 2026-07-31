import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { auditMigration, type Finding } from './rls-audit';

/**
 * `pnpm check:rls` — fails when a migration creates a table without turning row
 * level security on for it.
 *
 * Cheap, and it catches the most dangerous mistake available on this branch. RLS
 * is the authorization layer here: a table without it is readable and writable
 * by anyone holding the publishable key, which is every visitor, because that
 * key ships in the browser bundle by design.
 *
 * This runs in CI and needs no database — it reads the SQL.
 */

const MIGRATIONS = path.resolve(process.cwd(), 'supabase/migrations');

let files: string[];
try {
	files = readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith('.sql'))
		.sort();
} catch {
	console.error(`No migrations directory at ${MIGRATIONS}.`);
	process.exit(1);
}

const findings: Finding[] = [];
for (const name of files) {
	findings.push(...auditMigration(name, readFileSync(path.join(MIGRATIONS, name), 'utf8')));
}

if (findings.length === 0) {
	console.log(
		`check:rls — ${files.length} migration(s), every table has RLS enabled and privileges granted.`
	);
	process.exit(0);
}

for (const finding of findings) {
	console.error(`${finding.file}: ${finding.table} — ${finding.message}`);
}
console.error(
	`\n${findings.length} unfinished table(s). See supabase/policy-snippets.sql for the standard owner-only set — RLS, policies AND the grant.`
);
process.exit(1);
