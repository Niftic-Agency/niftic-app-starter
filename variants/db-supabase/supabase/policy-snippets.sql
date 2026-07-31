-- Standard policies. Copy into a migration and change the table name.
--
-- Every migration that creates a table must also enable row level security in
-- the SAME file — `pnpm check:rls` fails the build otherwise, and the window
-- between "table exists" and "table is protected" is exactly the gap that check
-- closes. A table without RLS is readable and writable by anyone holding the
-- publishable key, which is every visitor, because that key ships in the
-- browser bundle by design.
--
-- Note `(select auth.uid())` rather than a bare `auth.uid()`. Wrapping it lets
-- Postgres evaluate it once per statement instead of once per row, which is the
-- difference between a policy you can put on a large table and one you cannot.

-- Policies are only half of it. Postgres checks table PRIVILEGES first, and RLS
-- filters rows within what a role may already touch — so a table with perfect
-- policies and no `grant` refuses every query, the owner's included, with
-- "permission denied for table …" (42501). It reads like a policy bug and is
-- not one. Worse, a test asserting an attacker is REFUSED still passes, for the
-- wrong reason. `pnpm check:rls` fails a created table that grants to nobody.

-- ── owner-only: the default for anything user-scoped ────────────────────────

alter table example enable row level security;

grant select, insert, update, delete on example to authenticated;

create policy "example: owners select" on example
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "example: owners insert" on example
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Both clauses. `using` decides which rows you may update; `with check` decides
-- what they may become. Omitting the second lets someone hand their row to
-- another user by rewriting user_id.
create policy "example: owners update" on example
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "example: owners delete" on example
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ── read-only to the owner, written only by the service role ────────────────
--
-- For anything the owner must be able to see but must not be able to forge — a
-- role is the obvious case. There is no insert or update policy at all, so no
-- token-bearing client can write it; the service-role client bypasses RLS and
-- is the only way in.

-- create policy "profiles: read own" on profiles
--   for select to authenticated
--   using ((select auth.uid()) = user_id);

-- ── public read, no write ───────────────────────────────────────────────────
--
-- `to anon, authenticated` — a published marketing table, say. Be certain the
-- table holds nothing user-specific: `anon` is every visitor.

-- create policy "posts: public read" on posts
--   for select to anon, authenticated
--   using (published_at is not null);
