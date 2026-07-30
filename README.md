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

| Milestone | Scope                                             | State       |
| --------- | ------------------------------------------------- | ----------- |
| M0        | Base app + configure engine + turso data/host     | **done**    |
| M1        | Email module (`sendEmail`, templates, dry run)    | **done**    |
| M1        | Better Auth — both modes, guards, permissions     | **done**    |
| M1        | Seed script + Playwright smokes                   | **done**    |
| M1        | R2 storage — signed upload/download, port + impl  | **done**    |
| M1        | `notes` reference feature + full smoke path       | **done**    |
| M1        | Admin shell — users, roles, bans, audit, settings | **done**    |
| M1        | Note attachments through the storage port         | **done**    |
| M1        | Organizations — membership, roles, invitations    | **done**    |
| M2        | Postgres — postgres-js, pooling rules, pg dialect | **done¹**   |
| M3–M5     | SQLite+Litestream · Static · Supabase             | not started |
| M6        | Claude skill, docs, bootstrap round-trip          | not started |

¹ **Not yet run against a real Postgres server.** The branch configures,
typechecks, lints, unit-tests, builds, and its schema generates valid Postgres
DDL — all verified locally. Applying a migration, seeding, and the Playwright
smokes happen in the `postgres-integration` CI job against a `postgres:17`
service container, and that job has never executed: there is no GitHub remote
yet, and the machine it was built on has neither Docker nor Postgres. Treat the
first CI run as the real acceptance test for M2.

**M1 is complete, and `turso` with it** — it configures, installs, passes
check/lint/test/build and its smokes, and is a required lane in the matrix. Seven
staged fixtures run alongside it, from `_m0-turso-minimal` (database and host
only) up to `_m1-turso-orgs`, so a regression points at the layer that broke.

Organizations are an opt-in axis rather than part of a preset: set
`organizations: true` on any Better Auth profile. Doing so adds a second
authorization axis — membership and role inside an organization, checked
alongside the user's own role — and requires `email: true`, because members join
by invitation and an invitation has to be delivered.

`sqlite`, `static` and `supabase` are wired into the matrix too and fail with
`E_MISSING_VARIANT` until their milestone lands: listed rather than hidden, so
the gap stays visible on every run.

## Docs

- [docs/architecture.md](docs/architecture.md) — how the engine works, and the
  API surprises found while building it.
- [docs/postgres-pooling.md](docs/postgres-pooling.md) — what transaction pooling
  rules out, and why the Postgres client refuses to boot on a direct connection
  string.
- [CLAUDE.md](CLAUDE.md) — orientation for Claude Code.

## Requirements

Node 24, pnpm 10. `nvm use` picks up `.node-version`.
