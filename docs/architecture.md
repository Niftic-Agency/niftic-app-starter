# Architecture

## The shape of the repo

`niftic-app-starter` is a **superset codebase plus a configure engine**. The repo
carries every supported variant; `pnpm configure` reads `niftic.app.yml`, prunes
the tree down to one concrete app, and deletes itself.

The product is the **generator**, not any single app. Two properties follow:

- **Deterministic.** The same manifest produces a byte-identical source tree. CI
  configures the same manifest twice and diffs with no exclusions, which is only
  possible because `generated.at` honours `SOURCE_DATE_EPOCH`.
- **Self-erasing.** A configured app has no `variants/`, no engine, no starter CI.
  It should read as though someone hand-built it for that profile.

Determinism stops at `pnpm install` — the guarantee is about the source tree, not
about `node_modules`.

## Base is the intersection, not a set of stubs

The base tree contains only what every profile has: the shell, the primitives,
env, logger, health, error pages. There are no placeholder `db`/`auth` modules for
variants to shadow, because a stub is a thing that can silently drift from the
real implementation.

Base carries **both** adapters as `provisional` dependencies so the unconfigured
superset can still `pnpm build`. That upgrades the starter's own CI from "it
typechecks" to "it builds", and prune drops whichever adapter the selected host
didn't re-declare.

`variants/` is excluded from the starter's tsconfig and ESLint. Variant code is
type-checked _after_ it is overlaid into a configured app, which is the only
context where its imports resolve. That is a real gap — a typo in an unbuilt
variant stays invisible until its preset lane runs — and it is accepted
deliberately, because the alternative is stubs in base.

## Registries, not file ownership

`handle` is where every cross-cutting concern lands: request id, auth, org
context. If variants owned `src/hooks.server.ts`, then `auth-better` + `orgs`
would need a combined copy of it, and every further combination another.

So base owns the file:

```ts
export const handle = sequence(...handles);
```

and configure **generates** `src/lib/server/registry/hooks.ts` from `registries`
declarations in each `variant.json`. The same mechanism carries health checks and
nav items, and the Drizzle schema barrel is derived the same way (from the plan's
own copy list, so shipping a table file is what wires it up).

The rule that keeps this honest: **two variants writing the same path is a hard
error**, never last-wins. Only one variant per axis is ever selected, so a
collision means the shared concern belongs in base behind a registry. Overwriting
a _base_ file is allowed but must be declared in `replaces` — and a `replaces`
entry pointing at a file that no longer exists is also an error, which is what
catches a base rename orphaning an override.

## Selector suffixes

`schema.pg.ts` / `schema.sqlite.ts` resolve to `schema.ts` based on the data
backend. Generalised past the spec's dialect rule into named selector groups, so
`authMode` gets a home too (`routes.internal.ts` / `routes.client.ts`) instead of
needing its own variant. One mechanism, four axes now: `dialect`, `authMode`,
`storage`, `organizations`.

`organizations` is the odd one out twice over, and both oddities are deliberate.

**Its value is derived, not read.** Every other group maps 1:1 to an axis value
in the manifest; this one maps a boolean, so `selectorValueFor` computes
`orgs` / `noorgs`.

**It exists because the registry pattern cannot be used here.** Registries are
how several variants contribute to one file everywhere else in this repo. For
Better Auth plugins they do not work: Better Auth derives its whole API surface
and session type from the **literal tuple** passed to `betterAuth()`. Typing that
list as `BetterAuthPlugin[]` — which is what collecting it from a registry does —
erases the inference, and `auth.api.setRole`, `auth.api.banUser` and `user.role`
vanish with it. That was built, measured at four type errors across
`permissions.ts`, `(app)/+layout.server.ts` and `admin/+page.server.ts`, and
reverted.

So the plugin list stays a literal in `auth.ts`, and `auth-better` ships two
literals — `plugins.orgs.ts` and `plugins.noorgs.ts` — for configure to choose
between. Spreading a tuple into an array literal preserves the tuple, so
`[admin(…), ...orgPlugins, sveltekitCookies(…)]` keeps every inference intact.

The consequence is that the organization plugin's **configuration** lives in
`auth-better`, not in the `orgs` variant. That is arguably where it belongs: one
plugin list, one place. The `orgs` variant owns the tables, the second
authorization axis and the routes.

## Environment

`src/lib/server/env.ts` is generated from the `env` declarations of the selected
variants, and two choices in it are load-bearing:

- **`$env/dynamic/private`, not static.** Static env inlines at build time and
  fails the build when a var is absent, so the preset matrix could never run
  `pnpm build` without a full set of real secrets. It is also what the container
  path needs: build the image once, supply env per deployment.
- **Lazy, memoised validation.** A top-level `parse()` runs during SSR module
  initialisation — i.e. during `vite build` and prerendering — and would crash for
  the same reason. `env()` throws on first real use, which is the correct moment.

## Surprises found while building (spec §16)

The spec says not to trust its own memory on API details. Verified against
primary sources; five things differed, and one was a trap.

**TypeScript `latest` (7.0.2) is unusable here.** `@sveltejs/kit` peers
`typescript: ^5.3.3 || ^6.0.0`, `svelte-check` peers `^5.0.0 || ^6.0.0`, and
`typescript-eslint` peers `>=4.8.4 <6.1.0`. The only line satisfying all three is
**6.0.x**, so TypeScript is pinned to `6.0.3`. Taking `latest` would have produced
a template that cannot typecheck. Vite 8 and ESLint 10 _are_ safe.

**Superforms needs the `zod4` adapter**, not `zod`:

```ts
import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
```

The plain `zod` export is now the Zod **3** adapter and warns at runtime if handed
a v4 schema.

**`adapter-vercel`'s `runtime` option is deprecated.** The spec says to pin the
newest Node runtime; don't. Set `engines.node` and let the Vercel project config
decide — its default is already 24.x. (The validator does accept `nodejs24.x`
despite the published docs omitting it; we simply don't use it.)

**Supabase replaced `safeGetSession` with `getClaims()`**, and `@supabase/ssr`'s
`setAll` now takes a second `headers` argument. The docs also name the key
`PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not the anon key. Affects M5; the spec's §8.4
wording must not be followed literally.

**Litestream 0.5 replaced the `replicas:` array with a single `replica:` field.**
Affects M3. `restore -if-db-not-exists -if-replica-exists` and `replicate -exec`
all still exist as the spec assumes.

Confirmed as spec'd, no change needed: drizzle-kit dialect `turso` with no
`driver` field; Better Auth's `drizzleAdapter` providers `sqlite | pg | mysql`;
admin and organization plugins at `better-auth/plugins`; `@tailwindcss/vite`
before `sveltekit()` in the Vite config.

## Surprises found while building organizations

Verified against Better Auth 1.6.25 itself — the plugin's own schema object and
route handlers — rather than the docs. Four of these are things the docs do not
say, and two were only found by running the app.

**The session cookie cache lies about the active organization.** `session.cookieCache`
serves `getSession` from a signed cookie, and the plugin's `setActiveOrganization`
writes the session row through `internalAdapter.updateSession`, which does not
refresh that cookie. So `locals.session.activeOrganizationId` can name the
previous organization for up to `cookieCache.maxAge` — long enough that creating
an organization redirected straight back to the picker. The fix is not to disable
the cache: `requireActiveOrgRole` reads the session ROW, joined to `member` in
one query, so the active organization and the membership in it come from the same
statement and cannot disagree. That query replaced the membership lookup that was
going to happen anyway, so it costs nothing. `locals.session.token` is still fine
to read — the cached copy and the row share it.

**`removeMember` does not clear the removed member's `active_organization_id`.**
A session can therefore point at an organization its owner is no longer in. This
is exactly why membership is re-derived from the database on every guarded route
rather than trusted from the session, and why an empty membership result sends
the caller to the picker instead of to a 404.

**`getInvitation` is recipient-only.** It refuses any session whose email is not
the invited address — including the admin who sent the invitation. Cancelling one
therefore cannot go through it; the members page re-scopes the invitation id
through `getFullOrganization` instead.

**`getFullOrganization` returns every invitation, id included, to any member.**
The ids are what accept, reject and cancel take, so the members route withholds
them from anyone below `admin`. For the same reason
`requireEmailVerificationOnInvitation` is turned on: Better Auth's own guidance
is to require it once invitation lists are exposed to members, and in both auth
modes a verified address is already guaranteed.

**Zod 4 applies `.trim()` to `z.email()` after validation, not before.**
`z.email().trim().toLowerCase()` rejects a pasted `"  Person@Example.COM "`
before it ever tidies it up. `z.string().trim().toLowerCase().pipe(z.email())`
is the order a form wants. (On a plain `z.string()`, `.trim()` does run before
the checks that follow it, which is why the slug field needs no pipe.)

**SvelteKit's CSRF origin check only bites in a real build.** A form POST with no
`Origin` header is answered 403 by `pnpm preview` and let through by `vite dev`.
Both are worth asserting, and only the built one can assert the first — so the
smoke posts twice, once without an origin and once with the right one, because
only the second reaches our own guard.

Also confirmed by reading the plugin: `createOrganization` requires a `slug`
(it is not optional); the endpoint named `createInvitation` on `auth.api` is
mounted at `/organization/invite-member`; `leaveOrganization` refuses the last
owner and does clear the active organization; and `acceptInvitation` moves the
invitation `pending → accepted` in one transaction, so a double submit cannot
produce two memberships.

## Surprises found while building the Postgres branch

**PgDog supports prepared statements in transaction mode.** This is the opposite
of the PgBouncer-era assumption, and the reason `prepare: false` needed a better
justification than the one everyone reaches for. PgDog caches each statement
globally and maps names per client. The template still turns prepared statements
off — see docs/postgres-pooling.md — but for reasons about serverless instance
churn and pooler portability, not because it would break.

**PgDog's defaults are port 6432 and `pooler_mode = transaction`**, which is what
makes "a remote host on the default Postgres port" a usable signal for "this
connection string is direct". That is the check `connection.ts` boots on.

**postgres-js has no `run`.** The libSQL branch's health check is
`db().run(sql\`select 1\`)`; postgres-js exposes `execute`. Outside the schema
files, this is the only place the two Drizzle branches differ.

**The seed script was silently dialect-locked.** It imported `@libsql/client`
directly, so it could never have run on Postgres. Both db variants now ship a
`scripts/db-connect.ts` — the seam that lets `seed.ts` be written once, since it
runs under plain tsx where `$lib` does not resolve and so cannot use
`src/lib/server/db`. `connection.ts` is deliberately free of `$lib` imports for
the same reason: the scripts import `isLoopback` from it directly.

## Surprises found while building the SQLite branch

**Two of the four pragmas do not persist, and the boot order made that matter.**
Measured against @libsql/client on a fresh file: `journal_mode` is `delete` and
persists once set; `busy_timeout` is `0` and resets on **every** connection;
`synchronous` is `FULL` and also resets; `foreign_keys` is already `1`, where
plain SQLite defaults it off. The consequence is not obvious — the container
entrypoint restores, then migrates, then hands the database to Litestream. With
the pragmas applied only on the app path, `journal_mode` was still `delete` after
migrate and seed, so Litestream was being handed a rollback-journal database.
Verified by checking, then fixed by moving them into a pure `pragmas.ts` that
both `src/lib/server/db/index.ts` and `scripts/db-connect.ts` use — the same seam
the Postgres branch uses for `connection.ts`.

**Unawaited pragmas are safe here, and that was tested rather than assumed.** The
file-backed libSQL client serialises statements on one connection in call order,
so a query issued immediately after an unawaited `PRAGMA` already sees it. That
is what lets `db()` stay synchronous. The `.catch` is not decoration: an
unhandled rejection at boot would take the process down.

**Litestream 0.5's release assets are not named after the tag.** The tarball is
`litestream-0.5.15-linux-x86_64.tar.gz` — no `v` prefix, and `x86_64` rather than
the `amd64` that `dpkg --print-architecture` reports. The obvious URL 404s at
image build time. The Dockerfile maps the architecture explicitly.

**Litestream 0.5 config, confirmed:** the per-database `replicas:` array is now a
single `replica:` field, and retention moved out of the replica into a global
`snapshot:` block. Environment variables are expanded in the config file, which
is what lets one `litestream.yml` serve every environment. `restore
-if-db-not-exists -if-replica-exists` and `replicate -exec` all still exist and
still mean what the spec assumed.

**One entrypoint, branching on a file.** `host-dokploy` serves both the sqlite and
postgres profiles, and their boot sequences differ. Rather than two variants
fighting over `entrypoint.sh`, the one file branches on whether `litestream.yml`
exists — which is precisely the thing that distinguishes them, since only
`db-sqlite-extras` ships one.

## Surprises found while building the static branch

**A prerendered page cannot have a form action**, which is why the contact form
posts to `/api/contact` rather than following the repo-wide "mutations go through
form actions" rule. The departure is in the mechanism, not the substance: the
payload is still Zod-validated server-side and the client-side schema is still
only a courtesy. It also means superforms cannot be used on that page — it is
built around a `+page.server.ts` returning form state, and there isn't one.

**A static site has nowhere to render a server-side outcome.** With no JS, the
endpoint cannot re-render the page you came from with an error on it. So success
and failure each get a small prerendered page (`/contact/thanks`,
`/contact/problem`) and the endpoint 303s to one of them; with JS the same
endpoint answers JSON and the form renders the result inline and never navigates.
Which one you get is decided by the `accept` header — a browser form post asks
for HTML, our `fetch` asks for JSON.

**`prerender = true` in the root layout cascades to endpoints too**, so
`/api/health` and `/api/contact` each opt out explicitly. A prerendered POST
handler fails the build rather than failing quietly, so a third server route that
forgets the line is a loud mistake rather than a silent one.

**Playwright counts an off-screen element as visible.** The honeypot is
deliberately a real, rendered text input — `display:none` and `type="hidden"` are
exactly what a bot skips — positioned far outside the viewport, `aria-hidden`,
and out of the tab order. `toBeHidden()` fails on it, correctly; the smoke
asserts the bounding box instead, which is the property that actually keeps it
away from people.

**The CSRF origin check applies to the contact endpoint**, which is worth knowing
before writing a test against it: a `request.post` with no `Origin` gets 403
before the handler runs. A browser always sends one. The smoke asserts both — the
403 for a foreign origin, and the real behaviour with the right one.

## What M2 has and has not been run against

Recorded here because CLAUDE.md's honesty clause requires it, and because the
next person will otherwise assume the matrix is green.

Verified locally: configure, `pnpm check` (0 errors), lint, unit tests including
eight for the connection rules, `pnpm build`, and `drizzle-kit generate` — whose
output was read and is valid Postgres, column-for-column identical to the libSQL
branch. The shared `seed.ts` / `migrate.ts` refactor was re-verified end to end
on the libSQL branch, including its 13 Playwright smokes.

**Never run:** a migration applied to a Postgres server, a query executed, the
seed script against Postgres, or the smokes on that branch. The
`postgres-integration` CI job exists for exactly this and has not executed —
there is no GitHub remote yet, and the machine has neither Docker nor Postgres.
The first run of that job is M2's real acceptance test.

## What M3 has and has not been run against

Verified locally, because a SQLite database is a file and adapter-node runs
anywhere: configure, check, lint, unit tests, build, `db:generate`, `db:migrate`,
`db:seed`, the eight Playwright smokes, and the app driven through the real
`node build/index.js` server — the same binary the container runs — with
`/api/health` green and a sign-in round trip. The pragma fix above was found and
confirmed this way.

**Never run:** `docker build`, `entrypoint.sh`, and every Litestream operation.
No image has been built and no byte has been replicated. The `container` CI job
runs spec §14's acceptance drill — boot on an empty volume, redeploy with data
intact, destroy the volume and restore from the replica — against MinIO standing
in for R2, and it has not executed either.

Two things that job cannot tell you even when it goes green: anything about R2
specifically (MinIO speaks the same S3 protocol, which is the point, but it is
not the same service), and anything about Dokploy itself. The first real deploy
is still the first real deploy.

## A gap in the spec's legality rules

Spec §3 rule 3 forbids `storage: r2` on the Supabase branch, to keep the fork
clean. The converse was not stated but follows from the same principle, and is
enforced: **`storage: supabase` requires `data: supabase`**
(`E_STORAGE_SUPABASE_DATA`). Supabase Storage lives in the Supabase project and is
governed by its RLS policies; on another data branch there is no project to hold
the bucket and no policy layer to authorize it.

Rule 4 gained the same kind of consequence: **`organizations: true` requires
`email: true`** (`E_ORGS_EMAIL`). Invitation is how a second person joins an
organization, the link carries a single-use invitation id, and
`sendInvitationEmail` goes through `sendEmail()` — a module that does not exist
in an app configured without email, so the import would not even resolve. Adding
it made `email` a legality axis, so the exhaustive sweep now varies it too:
2,880 combinations, 332 legal.

The host × data matrix entries marked "not in v1" (supabase or static on Dokploy)
are **warnings**, not errors — they are a support statement rather than a physical
constraint, unlike the SQLite rules which describe something that genuinely
cannot work.
