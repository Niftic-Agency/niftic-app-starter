-- The reference resource. Every new table on this branch is cloned from this
-- file, policies included.

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  -- Null when there is no attachment, and always null on apps configured
  -- without storage.
  attachment_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- In the SAME migration as the create. `pnpm check:rls` fails the build
-- otherwise, because the gap between the two is a window where the table is
-- live and readable by anyone holding the publishable key.
alter table notes enable row level security;

create index notes_user_id_idx on notes (user_id);

-- `(select auth.uid())` rather than a bare call: Postgres then evaluates it once
-- per statement instead of once per row.
create policy "notes: owners select" on notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "notes: owners insert" on notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- BOTH clauses. `using` decides which rows may be updated; `with check` decides
-- what they may become. Without the second, an owner could hand their note to
-- somebody else by rewriting user_id — or take one, if `using` were ever
-- widened.
create policy "notes: owners update" on notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notes: owners delete" on notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Note there is no policy for `anon` at all. An anonymous caller is not
-- forbidden by a rule that says "deny" — RLS denies by default, and the absence
-- of a matching policy IS the denial.

create function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_touch_updated_at
  before update on notes
  for each row execute function touch_updated_at();

-- Privileges, which policies do not imply. Without this the owner's own select
-- fails with "permission denied for table notes" (42501) before any policy is
-- consulted. The set matches the four policies above exactly.
grant select, insert, update, delete on notes to authenticated;
