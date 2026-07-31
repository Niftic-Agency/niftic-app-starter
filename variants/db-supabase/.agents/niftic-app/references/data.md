# Data — Supabase, where the database is the authorization layer

On this branch a `where` clause is not what keeps one user out of another's
rows; the policy is. Server code uses the **user-scoped** client, so its queries
are policed exactly as a browser query would be. Getting a policy wrong is
silent — nothing throws, the query simply returns rows it should not have.

## Two clients, and the wall between them

- `supabase(event)` from `$lib/server/supabase` — the user-scoped client. The
  default for everything.
- `$lib/server/admin/` — the service-role client. **Bypasses RLS entirely**, so
  a query through it has skipped authorization.

ESLint refuses `$lib/server/admin/service-client` to anything outside that
directory. Privileged work goes in a module beside it — `profiles.ts`,
`audit.ts` — and routes call those by name, so every query that skips RLS on
this branch is in one directory, small enough to read in one sitting. A route
that needs a new privileged operation adds a function there rather than reaching
for the client.

Reach for the service client only where there is no user to scope to — a
scheduled job, a webhook, an admin screen that is authorized by role in code
first. Never to make a policy problem go away.

## Adding a table

Write one migration under `supabase/migrations/` that creates the table, enables
row level security, adds its policies, **and grants privileges**. `pnpm
check:rls` fails a migration missing either the RLS or the grant.

Policies are only half of authorization. Postgres checks table privileges
first, and RLS filters rows within what a role may already touch — so a table
with perfect policies and no `grant` refuses every query, the owner's included,
with `permission denied for table …` (42501). It reads like a policy bug and is
not one, and a test asserting an attacker is refused will still pass, for the
wrong reason. Grant exactly the verbs the policies contemplate:

```sql
grant select, insert, update, delete on notes to authenticated;
```

A table nobody but the server may touch — an audit log — grants to
`service_role` and to no one else. The service role bypasses RLS; it does not
bypass privileges.

`supabase/policy-snippets.sql` carries the standard owner-only set — copy it and
change the table name. Note `(select auth.uid())` rather than a bare
`auth.uid()`: the wrapper lets Postgres evaluate it once per statement rather
than once per row.

```bash
pnpm db:reset      # apply migrations to the local stack from scratch
pnpm check:rls     # the lint that must pass before anything else
pnpm types:gen     # regenerate src/lib/database.types.ts
```

Regenerate the types after every schema change and commit them with the
migration. Committed types that disagree with the schema are worse than none:
they are confidently wrong, and every editor believes them. CI regenerates and
fails on any difference.

`src/lib/database.types.ts` is that generator's output and nothing else — no
header, no hand edits, because CI compares it byte for byte. Committed rather
than generated at build time so a fresh checkout typechecks without a running
database, and so a schema change nobody regenerated types for shows up as a diff
in review. `types:gen` runs Prettier over the result, which is what lets the same
file satisfy both `pnpm lint` and the drift check.

## Policy tests are not optional

Every new table gets a test in `tests/policies.spec.ts` that holds the
publishable key the way an attacker would — it is in the browser bundle by
design — and asserts the database refuses. Cover, for a second user's row:
select returns nothing, insert is rejected, update changes nothing, delete
changes nothing. A test that only proves the owner's happy path proves nothing
about the policy.

Run them against the local stack:

```bash
pnpm db:start && pnpm test:e2e
```

## Anything that is not a table

Validation, permissions and helpers are ordinary Vitest units. The rule that
makes this branch legible is that authorization questions get answered by a
policy test against a real database, and everything else gets answered in
Vitest.
