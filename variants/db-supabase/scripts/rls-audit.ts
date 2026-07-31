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
 * `grant … on <table> to <role>` — privileges, which policies do not imply.
 *
 * The second half of the same mistake. RLS filters rows within what a role may
 * already touch, so a table with policies and no grant is refused at the table
 * level before any policy is consulted: every query returns "permission denied"
 * (42501), the owner's included. It reads as a policy bug and is not one, and
 * worse, a test asserting that an attacker is REFUSED still passes — for the
 * wrong reason.
 */
const GRANT_ON =
	/\bgrant\s+[^;]*?\bon\s+(?:table\s+)?((?:"[^"]+"|[a-z0-9_]+)(?:\s*\.\s*(?:"[^"]+"|[a-z0-9_]+))?)\s+to\s+/gi;

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

	const granted = new Set<string>();
	for (const match of cleaned.matchAll(GRANT_ON)) {
		granted.add(normalise(match[1]));
	}

	const findings: Finding[] = [];
	for (const table of [...created].sort()) {
		if (!protectedTables.has(table)) {
			findings.push({
				file,
				table,
				message: `created without "alter table ${table} enable row level security" in the same migration`
			});
		}
		// Deliberately "to anybody", not "to authenticated". A deny-all table like
		// an audit log is legitimate — it grants to service_role and to nobody
		// else — but a table granted to NO role is unusable by every client there
		// is, which is never what anyone meant.
		if (!granted.has(table)) {
			findings.push({
				file,
				table,
				message: `created without any "grant … on ${table} to …" — policies do not imply privileges, so every query would be refused with 42501`
			});
		}
	}

	return findings;
}
