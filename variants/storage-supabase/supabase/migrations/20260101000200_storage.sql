-- The uploads ledger, and the private bucket the objects live in.

create table uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null unique,
  filename text not null,
  content_type text not null,
  size bigint not null,
  created_at timestamptz not null default now()
);

alter table uploads enable row level security;

create index uploads_user_id_idx on uploads (user_id);

create policy "uploads: owners select" on uploads
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "uploads: owners insert" on uploads
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "uploads: owners delete" on uploads
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No update policy: an upload record describes an object that already exists.
-- Changing the key afterwards would point a row at somebody else's file.

-- ── the bucket ──────────────────────────────────────────────────────────────
--
-- Private. Everything is reached through a signed URL. `public = false` is the
-- single most important character in this file: a public bucket makes every
-- object readable by anyone who can guess a key, and keys are guessable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets',
  'assets',
  false,
  10485760, -- 10MiB. This is what actually enforces the cap: unlike the R2
            -- branch there is no signed Content-Length to hold the client to.
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/csv'
  ]
)
on conflict (id) do nothing;

-- Object policies. `storage.objects` already has RLS enabled by Supabase, so
-- these are the second lock: even a validly signed URL is checked against them.
--
-- The key layout is `uploads/{userId}/{id}-{name}`, so the owner is the first
-- path segment after the prefix — which is also what the application's
-- `keyBelongsTo` re-derives rather than trusting a lookup.

create policy "assets: owners read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "assets: owners write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "assets: owners delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
