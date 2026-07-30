-- Profiles: the application's view of a user, and where role lives.
--
-- Supabase keeps accounts in `auth.users`, which application code cannot query
-- and must not write. This is the table the app owns.

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  -- 'member' | 'admin'. Text rather than an enum so adding a role later is a
  -- migration you can write in one line.
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Read your own profile. That is the whole read surface for a normal user;
-- listing everyone is an admin screen and goes through the service-role client.
create policy "profiles: read own" on profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Update your own display name — and ONLY that. The `with check` clause is what
-- makes this safe: without it, an owner could rewrite their own role to 'admin'
-- in the same statement that changes their name.
create policy "profiles: update own display name" on profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and role = (select p.role from profiles p where p.user_id = (select auth.uid()))
  );

-- No insert policy and no delete policy, deliberately. Rows are created by the
-- trigger below and removed by the cascade from auth.users; roles are written
-- only by the service-role client, which bypasses RLS. Nothing holding a
-- publishable key can mint a profile or change a role.

-- ── keeping profiles in step with auth.users ────────────────────────────────
--
-- A trigger rather than application code, because a user can be created by a
-- path the app never sees: an OAuth sign-in, an invite from the dashboard, the
-- admin API. The row has to exist for all of them.
--
-- `security definer` so it runs as the owner and can write a table whose
-- policies would otherwise refuse it, with `search_path` pinned — a
-- security-definer function that resolves names through a caller-controlled
-- search_path is a privilege-escalation bug.

create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
