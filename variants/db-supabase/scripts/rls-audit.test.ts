import { describe, expect, it } from 'vitest';
import { auditMigration } from './rls-audit';

/** A table is only finished when it has BOTH: the mechanism on, and privileges. */
const ok = `
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade
);
alter table notes enable row level security;
grant select, insert, update, delete on notes to authenticated;
`;

/** Findings for one table, split by which half of the rule they belong to. */
const rls = (findings: { table: string; message: string }[]) =>
	findings.filter((f) => f.message.includes('row level security')).map((f) => f.table);
const grants = (findings: { table: string; message: string }[]) =>
	findings.filter((f) => f.message.includes('grant')).map((f) => f.table);

describe('auditMigration', () => {
	it('passes a table that turns RLS on and grants privileges in the same migration', () => {
		expect(auditMigration('0001.sql', ok)).toEqual([]);
	});

	it('fails a table with no RLS — the mistake this exists to catch', () => {
		const findings = auditMigration('0001.sql', 'create table notes (id uuid primary key);');
		expect(rls(findings)).toEqual(['notes']);
	});

	it('fails a table with RLS and no grant — refused with 42501, which reads as a policy bug', () => {
		// The second half, and the one that bit for real: policies do not imply
		// privileges, so every query is refused at the table level before a policy
		// is ever consulted — the owner's included.
		const sql = `
			create table notes (id uuid primary key);
			alter table notes enable row level security;
			create policy "notes: owners select" on notes for select to authenticated using (true);
		`;
		const findings = auditMigration('0001.sql', sql);
		expect(rls(findings)).toEqual([]);
		expect(grants(findings)).toEqual(['notes']);
	});

	it('accepts a deny-all table that grants only to the service role', () => {
		// An audit log is legitimately unreachable by any token-bearing client. The
		// rule is "somebody can use it", not "authenticated can use it".
		const sql = `
			create table audit_log (id uuid primary key);
			alter table audit_log enable row level security;
			grant select, insert on audit_log to service_role;
		`;
		expect(auditMigration('0001.sql', sql)).toEqual([]);
	});

	it('does not accept RLS or a grant belonging to some OTHER table', () => {
		const sql = `
			create table notes (id uuid primary key);
			create table tags (id uuid primary key);
			alter table tags enable row level security;
			grant select on tags to authenticated;
		`;
		const findings = auditMigration('0001.sql', sql);
		expect(rls(findings)).toEqual(['notes']);
		expect(grants(findings)).toEqual(['notes']);
	});

	it('handles the spellings that actually appear in migrations', () => {
		for (const sql of [
			'create table if not exists notes (id uuid);\nalter table notes enable row level security;\ngrant select on notes to authenticated;',
			'create table public.notes (id uuid);\nalter table public.notes enable row level security;\ngrant select on public.notes to authenticated;',
			'create table "notes" (id uuid);\nalter table "notes" enable row level security;\ngrant select on "notes" to authenticated;',
			// Mixed case and extra whitespace — SQL does not care and neither should this.
			'CREATE TABLE  notes (id uuid);\nALTER  TABLE notes  ENABLE ROW LEVEL SECURITY;\nGRANT  SELECT  ON notes  TO authenticated;',
			// Schema-qualified on one side only.
			'create table public.notes (id uuid);\nalter table notes enable row level security;\ngrant all on table notes to authenticated;',
			// Several roles in one statement, which is how Supabase's own SQL reads.
			'create table notes (id uuid);\nalter table notes enable row level security;\ngrant select, insert on notes to anon, authenticated, service_role;'
		]) {
			expect(auditMigration('m.sql', sql), sql).toEqual([]);
		}
	});

	it('is not fooled by a comment', () => {
		// The classic false pass: the reminder is there, the statement is not.
		const sql = `
			create table notes (id uuid primary key);
			-- alter table notes enable row level security;
			-- grant select on notes to authenticated;
		`;
		const findings = auditMigration('0001.sql', sql);
		expect(rls(findings)).toEqual(['notes']);
		expect(grants(findings)).toEqual(['notes']);
	});

	it('is not fooled by a string literal', () => {
		const sql = `
			create table notes (id uuid primary key);
			insert into audit (detail) values ('alter table notes enable row level security');
			insert into audit (detail) values ('grant select on notes to authenticated');
		`;
		const findings = auditMigration('0001.sql', sql);
		expect(rls(findings)).toEqual(['notes']);
		expect(grants(findings)).toEqual(['notes']);
	});

	it('does not report a table it never saw created', () => {
		// Altering a table created in an earlier migration is normal and is not
		// this check's business.
		expect(auditMigration('0002.sql', 'alter table notes add column body text;')).toEqual([]);
	});

	it('reports every unfinished table, not just the first', () => {
		const sql = 'create table a (id uuid); create table b (id uuid);';
		expect(rls(auditMigration('0001.sql', sql))).toEqual(['a', 'b']);
		expect(grants(auditMigration('0001.sql', sql))).toEqual(['a', 'b']);
	});
});
