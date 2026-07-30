/**
 * The audit itself, kept pure so it can be unit-tested without a filesystem.
 *
 * Deliberately a text check rather than a database one. It has to run on a pull
 * request, before anything is applied anywhere, and the mistake it exists to
 * catch is visible in the SQL: a `create table` with no matching
 * `enable row level security`.
 *
 * It is a lint, not a proof. It cannot tell you a policy is CORRECT — only that
 * you remembered to turn the mechanism on. Policy tests are the other half, and
 * they run against the real stack.
 */

export interface Finding {
	file: string;
	table: string;
	message: string;
}

/** Strip comments and string literals so neither can produce a false positive. */
function stripNoise(sql: string): string {
	return sql
		.replace(/--[^\n]*/g, ' ')
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/'(?:[^']|'')*'/g, "''")
		.replace(/\$\$[\s\S]*?\$\$/g, ' ');
}

/** `schema.name`, `"name"`, `name` → a bare lowercase table name. */
function normalise(raw: string): string {
	const last = raw.trim().split('.').pop() ?? '';
	return last.replace(/"/g, '').toLowerCase();
}

const CREATE_TABLE =
	/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|[a-z0-9_]+)(?:\s*\.\s*(?:"[^"]+"|[a-z0-9_]+))?)/gi;

const ENABLE_RLS =
	/\balter\s+table\s+(?:if\s+exists\s+)?((?:"[^"]+"|[a-z0-9_]+)(?:\s*\.\s*(?:"[^"]+"|[a-z0-9_]+))?)\s+enable\s+row\s+level\s+security/gi;

/**
 * Tables created in this migration that it does not also protect.
 *
 * Scoped to one file on purpose: "the RLS is in the next migration" is exactly
 * the window this check exists to close, because between the two the table is
 * live and open.
 */
export function auditMigration(file: string, sql: string): Finding[] {
	const cleaned = stripNoise(sql);

	const created = new Set<string>();
	for (const match of cleaned.matchAll(CREATE_TABLE)) {
		created.add(normalise(match[1]));
	}

	const protectedTables = new Set<string>();
	for (const match of cleaned.matchAll(ENABLE_RLS)) {
		protectedTables.add(normalise(match[1]));
	}

	return [...created]
		.filter((table) => !protectedTables.has(table))
		.sort()
		.map((table) => ({
			file,
			table,
			message: `created without "alter table ${table} enable row level security" in the same migration`
		}));
}
