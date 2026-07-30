# niftic-app-starter

A GitHub template that produces every kind of app Niftic ships. It is a superset
codebase plus a configure engine: this repo carries all supported variants, and a
one-time `pnpm configure` prunes it down to one concrete application.

```bash
pnpm install
pnpm configure          # interactive
pnpm configure --yes    # read the committed niftic.app.yml unchanged
```

Configure is **one-way**. It deletes `variants/` and itself, and refuses to run
again once `niftic.app.yml` carries a `generated:` block.

## Profiles

| preset     | data                | host    | auth          | storage  |
| ---------- | ------------------- | ------- | ------------- | -------- |
| `turso`    | Turso (libSQL)      | Vercel  | Better Auth   | R2       |
| `postgres` | Postgres via PgDog  | Vercel¹ | Better Auth   | R2       |
| `sqlite`   | SQLite + Litestream | Dokploy | Better Auth   | R2       |
| `supabase` | Supabase            | Vercel  | Supabase Auth | Supabase |
| `static`   | none (prerendered)  | Vercel  | none          | none     |

¹ may use Dokploy instead.

Some combinations are rejected with an explanation rather than a stack trace —
`data: sqlite` needs a disk and one writer, so it requires `host: dokploy` and
`replicas: 1`; the Supabase branch is a genuine fork, so its data, auth and
storage travel together. Run `pnpm configure --dry-run` to see the plan and any
warnings before anything is written.

## Status

| Milestone | Scope                                             | State     |
| --------- | ------------------------------------------------- | --------- |
| M0        | Base app + configure engine + turso data/host     | **done**  |
| M1        | Email module (`sendEmail`, templates, dry run)    | **done**  |
| M1        | Better Auth — both modes, guards, permissions     | **done**  |
| M1        | Seed script + Playwright smokes                   | **done**  |
| M1        | R2 storage — signed upload/download, port + impl  | **done**  |
| M1        | `notes` reference feature + full smoke path       | **done**  |
| M1        | Admin shell — users, roles, bans, audit, settings | **done**  |
| M1        | Note attachments through the storage port         | **done**  |
| M1        | Organizations — membership, roles, invitations    | **done**  |
| M2        | Postgres — postgres-js, pooling rules, pg dialect | **done¹** |
| M3        | SQLite + Litestream + Dokploy container           | **done²** |
| M4        | Static — prerendered shell + contact endpoint     | **done**  |
| M5        | Supabase fork — RLS-first, policy tests           | **done³** |
| M6        | Claude skill, docs, bootstrap round-trip          | **done⁴** |

¹ **Not yet run against a real Postgres server.** The branch configures,
typechecks, lints, unit-tests, builds, and its schema generates valid Postgres
DDL — all verified locally. Applying a migration, seeding, and the Playwright
smokes happen in the `postgres-integration` CI job against a `postgres:17`
service container, and that job has never executed: there is no GitHub remote
yet, and the machine it was built on has neither Docker nor Postgres. Treat the
first CI run as the real acceptance test for M2.

² **The app is verified; the container is not.** The sqlite profile configures,
typechecks, lints, unit-tests, migrates, seeds and passes its smokes locally, and
was driven through the real `node build/index.js` server that the container runs.
What has never executed is the container itself — `docker build`, the entrypoint,
and Litestream restore/replicate — because this machine has no Docker. The
`container` CI job runs the full acceptance drill (boot on an empty volume,
redeploy with data intact, destroy the volume and restore from the replica)
against MinIO, and is likewise unrun.

³ **The RLS check is verified; the local stack is not.** The fork configures,
typechecks, lints, unit-tests and builds locally, and `pnpm check:rls` was run
against the real migrations _and_ against a deliberately bad one, which it
rejected — one of spec §14's three acceptance criteria for M5, met without
Docker. The other two need `supabase start`: applying migrations, the policy
tests, and the types-drift check all live in the `supabase-integration` CI job,
which has never executed. No query on this branch has ever reached a database.

⁴ **The round-trip was run for real, locally; the dispatch itself was not.** A
repo was created from this tree, a manifest committed and pushed to a bare
remote, and `bootstrap.yml`'s own steps executed against it: it configured,
committed `chore: configure app (turso)`, pushed, and a fresh clone of that
remote carries a `generated:` block, the app's `ci.yml`, the skill — and none of
`variants/`, the engine, either starter workflow, `docs/architecture.md` or the
setup reference. A second dispatch was refused. What has not happened is a real
`workflow_dispatch` on a GitHub repo created from the template, which needs the
template flag set on the repo and a provisioner to call it.

**M1 is complete, and `turso` with it** — it configures, installs, passes
check/lint/test/build and its smokes, and is a required lane in the matrix. Seven
staged fixtures run alongside it, from `_m0-turso-minimal` (database and host
only) up to `_m1-turso-orgs`, so a regression points at the layer that broke.

Organizations are an opt-in axis rather than part of a preset: set
`organizations: true` on any Better Auth profile. Doing so adds a second
authorization axis — membership and role inside an organization, checked
alongside the user's own role — and requires `email: true`, because members join
by invitation and an invitation has to be delivered.

The `static` profile is prerendered end to end: every page is HTML on the CDN,
and the only server code that survives configure is `/api/health` and
`/api/contact`. Its lockfile carries no database, auth or storage package — CI
asserts that against the installed tree on every run, not just against
`package.json`.

**All five profiles now configure and pass their checks.** No preset is left
failing with `E_MISSING_VARIANT`.

On the Supabase fork, row level security _is_ the authorization layer. Server
code uses a user-scoped client so its queries are policed by the same policies a
browser query would be; the service-role client that bypasses them lives in
`$lib/server/admin/` and ESLint refuses the import anywhere else. `pnpm
check:rls` fails any migration that creates a table without enabling RLS in the
same file.

## The skill

`.claude/skills/niftic-app/` is how Claude Code works in a repo generated from
this template — and in this one, before it is configured. `niftic.app.yml`
decides which half applies: with no `generated:` block the skill runs the setup
interview and then `pnpm configure`; afterwards it carries the procedures for
adding a resource, a role, an admin screen, an upload or an email, and for
reviewing security before a deploy.

Its `references/` are pruned the same way everything else is, so a generated app
is taught only its own stack: the Supabase fork gets the RLS rules and no
Drizzle, a static site gets neither, and the setup interview — which can never
run twice — is removed by the run that configures the app.

## Docs

- [docs/architecture.md](docs/architecture.md) — how the engine works, and the
  API surprises found while building it. Starter-only; configure removes it.
- [CLAUDE.md](CLAUDE.md) — orientation for Claude Code. A generated app gets its
  own, written by configure from the profile it just built.

Profile docs live in the variant that owns them, so an app only receives the ones
that apply to it:

- [postgres-pooling.md](variants/db-drizzle-postgres/docs/postgres-pooling.md) —
  what transaction pooling rules out, and why the Postgres client refuses to boot
  on a direct connection string.
- [sqlite-litestream.md](variants/db-sqlite-extras/docs/sqlite-litestream.md) —
  the replication rules, and the restore drill.
- [deploy-dokploy.md](variants/host-dokploy/docs/deploy-dokploy.md) — creating
  the app, the volume, and why replicas stay at 1.

## Requirements

Node 24, pnpm 10. `nvm use` picks up `.node-version`.
