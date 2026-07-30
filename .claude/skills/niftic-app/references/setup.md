# Setup — the interview

Runs once, on a repo whose `niftic.app.yml` has no `generated:` block. It ends
with a configured app and a provisioning list the user has to work through.

## 1. Interview

Ask for these. One question at a time, and offer the default so the user can
take it and move on. Everything except the profile is cheap to change later;
the profile is not, so spend the time there.

| Field                         | Ask                                                              |
| ----------------------------- | ---------------------------------------------------------------- |
| `name`, `slug`                | Display name; slug defaults to a kebab-cased name                |
| `description`                 | One line — it lands in `CLAUDE.md` and the app config            |
| `visibility`                  | `internal` (Niftic staff) or `client`                            |
| `preset`                      | The profile — see the tradeoffs below                            |
| `authMode`                    | `internal`: Google, domain-restricted · `client`: email/password |
| `organizations`               | Do users belong to teams that own the data?                      |
| `storage`, `admin`, `example` | Uploads? A protected `/admin` shell? Keep the `notes` example?   |
| `deployment.productionUrl`    | Blank is fine if it does not exist yet                           |
| `host`                        | Only where the preset leaves a choice — `postgres` does          |

The five profiles, one tradeoff each:

- **turso** — Vercel + Turso (libSQL). The default. Serverless, cheap, no disk to
  manage; a network hop per query.
- **postgres** — Vercel or Dokploy + Postgres through PgDog. Real relational
  load, real extensions; you own a pooler and its connection limits.
- **sqlite** — Dokploy only, one disk, Litestream to object storage. The fastest
  reads available and the simplest bill; exactly one writer, so `replicas: 1`.
- **supabase** — Vercel + Supabase. RLS, Supabase Auth and Storage in one
  product; a genuine fork of the codebase, and organizations are not built on it.
- **static** — Prerendered marketing site. No database, no auth, no storage. A
  contact form is the only thing that talks to a server.

`visibility: internal` pairs with `authMode: internal` almost every time. If the
user asks for both `data: sqlite` and more than one replica, or for
organizations on Supabase, say so during the interview — configure will refuse,
and a refusal is cheaper before the manifest is written than after.

## 2. Write the manifest

Edit `niftic.app.yml` in place. Keep its comments; they explain the axes to
whoever reads the repo next. Leave an axis at its preset default rather than
restating it.

## 3. Configure

```bash
pnpm configure --dry-run   # the plan, plus any legality warnings
pnpm configure --yes
```

It rewrites the tree, installs, and runs check, lint, unit tests and build. It
refuses to start on a dirty worktree, so commit first — that is also what makes
`git checkout . && git clean -fd` an undo.

One-way by design: `variants/` and the engine delete themselves, and a
`generated:` block lands in the manifest to block a second run. Changing profile
afterwards is a manual migration, not a re-run.

## 4. Provisioning

Configure prints a numbered checklist for the profile it just built, then a
first prompt to hand back to the user. Walk them through **what it printed** —
it knows which services this app actually needs. Fill `.env` from
`.env.example` as each service comes up.

Nothing in the checklist is automated from here: creating a Turso database, an
R2 bucket, a Resend domain or a Vercel project is the user's to do, in their own
accounts. Never ask for a credential to be pasted into the chat; the user puts
it in `.env` and in the host's environment settings.

Done when `.env` is filled, `pnpm dev` boots, and `/api/health` is green.
