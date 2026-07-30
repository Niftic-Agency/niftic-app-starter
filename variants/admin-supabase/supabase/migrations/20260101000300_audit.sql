-- Audit log for admin actions.
--
-- Written only by the service-role client, which is the only thing that can
-- reach it: there is no insert policy. A log an actor can write is a log an
-- actor can forge.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_email text not null,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create index audit_log_created_at_idx on audit_log (created_at desc);

-- No policies whatsoever. Not an oversight: RLS denies by default, so with none
-- defined, no token-bearing client can read or write this table. The admin
-- screens read it through the service-role client.
