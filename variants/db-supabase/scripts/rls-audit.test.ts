import { describe, expect, it } from 'vitest';
import { auditMigration } from './rls-audit';

const ok = `
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade
);
alter table notes enable row level security;
`;

describe('auditMigration', () => {
	it('passes a table that turns RLS on in the same migration', () => {
		expect(auditMigration('0001.sql', ok)).toEqual([]);
	});

	it('fails a table that does not — the mistake this exists to catch', () => {
		const findings = auditMigration('0001.sql', 'create table notes (id uuid primary key);');
		expect(findings).toHaveLength(1);
		expect(findings[0].table).toBe('notes');
	});

	it('does not accept RLS enabled on some OTHER table', () => {
		const sql = `
			create table notes (id uuid primary key);
			create table tags (id uuid primary key);
			alter table tags enable row level security;
		`;
		expect(auditMigration('0001.sql', sql).map((f) => f.table)).toEqual(['notes']);
	});

	it('handles the spellings that actually appear in migrations', () => {
		for (const sql of [
			'create table if not exists notes (id uuid);\nalter table notes enable row level security;',
			'create table public.notes (id uuid);\nalter table public.notes enable row level security;',
			'create table "notes" (id uuid);\nalter table "notes" enable row level security;',
			// Mixed case and extra whitespace — SQL does not care and neither should this.
			'CREATE TABLE  notes (id uuid);\nALTER  TABLE notes  ENABLE ROW LEVEL SECURITY;',
			// Schema-qualified on one side only.
			'create table public.notes (id uuid);\nalter table notes enable row level security;'
		]) {
			expect(auditMigration('m.sql', sql), sql).toEqual([]);
		}
	});

	it('is not fooled by a comment', () => {
		// The classic false pass: the reminder is there, the statement is not.
		const sql = `
			create table notes (id uuid primary key);
			-- alter table notes enable row level security;
		`;
		expect(auditMigration('0001.sql', sql)).toHaveLength(1);
	});

	it('is not fooled by a string literal', () => {
		const sql = `
			create table notes (id uuid primary key);
			insert into audit (detail) values ('alter table notes enable row level security');
		`;
		expect(auditMigration('0001.sql', sql)).toHaveLength(1);
	});

	it('does not report a table it never saw created', () => {
		// Altering a table created in an earlier migration is normal and is not
		// this check's business.
		expect(auditMigration('0002.sql', 'alter table notes add column body text;')).toEqual([]);
	});

	it('reports every unprotected table, not just the first', () => {
		const sql = 'create table a (id uuid); create table b (id uuid);';
		expect(auditMigration('0001.sql', sql).map((f) => f.table)).toEqual(['a', 'b']);
	});
});
