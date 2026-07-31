# niftic-app-starter

A template to produce fast, strong apps using Niftic best practices. It is a superset
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

| preset     | data                | host           | auth          | storage  |
| ---------- | ------------------- | -------------- | ------------- | -------- |
| `turso`    | Turso (libSQL)      | Vercel         | Better Auth   | R2       |
| `postgres` | Postgres via PgDog  | Vercel¹        | Better Auth   | R2       |
| `sqlite`   | SQLite + Litestream | Dokploy / Node | Better Auth   | R2       |
| `supabase` | Supabase            | Vercel         | Supabase Auth | Supabase |
| `static`   | none (prerendered)  | Vercel         | none          | none     |

¹ may use Dokploy instead.

Some combinations are rejected. Fore example, `data: sqlite` needs a disk and one writer, so it requires `host: dokploy` and
`replicas: 1`; the Supabase branch is a genuine fork, so its data, auth and
storage travel together. Run `pnpm configure --dry-run` to see the plan and any
warnings before anything is written.

## Working with an agent

Not tied to one vendor. The instructions live once, in files each tool already
looks for:

| File                              | Who reads it                          |
| --------------------------------- | ------------------------------------- |
| `AGENTS.md`                       | Codex, Cursor, Aider, Jules, and you  |
| `.agents/niftic-app/GUIDE.md`     | the workflows, for any of them        |
| `CLAUDE.md`                       | Claude Code — points at `AGENTS.md`   |
| `.claude/skills/niftic-app/`      | Claude's skill — points at `GUIDE.md` |
| `.github/copilot-instructions.md` | Copilot — points at both              |

`AGENTS.md` says what the app is: stack, commands, layout, the rules that hold.
The guide says how to change it — `niftic.app.yml` decides which half applies.
With no `generated:` block it runs the setup interview and then `pnpm
configure`; afterwards it carries the procedures for adding a resource, a role,
an admin screen, an upload or an email, and for reviewing security before a
deploy.

Only the bottom three are per-vendor, and none of them carries a rule of its
own — they exist because those tools look for a particular filename. Supporting
another agent is one more file that says "read `AGENTS.md`", and anything that
already reads `AGENTS.md` needs nothing at all.

The guide's `references/` are pruned the same way everything else is, so a
generated app is taught only its own stack: the Supabase fork gets the RLS rules
and no Drizzle, a static site gets neither, and the setup interview — which can
never run twice — is removed by the run that configures the app.

## Docs

- [docs/architecture.md](docs/architecture.md) — how the engine works, and the
  API surprises found while building it. Starter-only; configure removes it.
- [AGENTS.md](AGENTS.md) — orientation for any coding agent, and for you. A
  generated app gets its own, written by configure from the profile it just
  built. [CLAUDE.md](CLAUDE.md) points at it.

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
