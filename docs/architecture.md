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

## Surprises found while building the Supabase fork

The spec's §8.4 is the section that has aged worst, and it was right to say so.

**`getSession()` must not be trusted, and `getUser()` is no longer the answer
either.** `getSession()` decodes the access token out of a cookie without
verifying it, so a forged cookie produces a forged user — Supabase's own types
say this in as many words. The spec's fix was `getUser()`, a network round trip
to the auth server on every request. **`getClaims()` supersedes both**: it
verifies the JWT against the project's JWKS, locally via WebCrypto for projects
on asymmetric signing keys, with the key set cached. Same guarantee as
`getUser()`, a fraction of the latency, and it falls back to a server call on
projects still using a symmetric secret — so it is never weaker.

**`setAll` takes a second argument, and dropping it is a vulnerability.**
`@supabase/ssr`'s cookie contract passes `headers` alongside the cookies to set:
`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`,
`Expires: 0`, `Pragma: no-cache`. A response that sets an auth cookie without
them can be cached by a CDN and then served — session token and all — to a
different person. Most examples on the web predate this parameter.

**The keys are `sb_publishable_…` and `sb_secret_…` now.** They replace the
legacy `anon` and `service_role` JWTs, which still work but are being retired.
The template uses the new names.

**RLS filters, it does not reject** — which is why "the request returned 200"
proves nothing on this branch. A `select` a policy forbids comes back as an
empty result, not an error. Every assertion in the policy tests is on the ROWS
for that reason, and the routes rely on the same property: `/api/files` answers
404 for someone else's object because the policy made the row invisible, not
because an `if` compared two ids.

**The `with check` half of an update policy is the subtle one.** `using` decides
which rows may be updated; `with check` decides what they may become. A policy
with only `using` lets an owner hand their row to somebody else by rewriting
`user_id`, and lets a `profiles` row grant itself a role. Both are asserted in
the policy tests.

**A `security definer` trigger needs `set search_path = ''`.** The
`handle_new_user` trigger writes `public.profiles` from an `auth.users` insert,
which means running as the owner — and a security-definer function that resolves
names through a caller-controlled `search_path` is a privilege-escalation bug.

**Two base-config gaps the fork exposed**, both fixed: the ESLint SDK boundary
listed `src/lib/server/supabase.ts`, but the server client is a directory here
(it ships with its health check); and `tests/**` was exempt from the `process.env`
rule but not the import rule, which a policy test must break on purpose — it
holds a publishable key the way an attacker would, deliberately bypassing the
app's own clients.

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

## What M5 has and has not been run against

Verified locally: configure, `pnpm check` (0 errors), lint, unit tests, build —
and **`pnpm check:rls`**, run against the four real migrations (pass) and against
a deliberately unprotected `create table` (fail, exit 1, naming the table). That
is one of spec §14's three acceptance criteria for M5, and it needs no Docker
because it reads SQL rather than querying a database.

**Never run:** `supabase start`, any migration, any query. No statement on this
branch has reached a database, the policy tests have never executed, and the
committed `database.types.ts` was written by hand to match the migrations rather
than generated — the types-drift check in CI is what will prove whether it is
right, and it is entirely possible that its first run fails on a detail of how
the generator formats output.

The `supabase-integration` job covers the rest: `check:rls` against real
migrations, a proof that `check:rls` still FAILS a bad one, `supabase start` and
`db reset`, the types-drift check, and the policy tests. It has not executed.

## The skill is pruned by the same machinery as the code

Spec §9 says configure prunes the skill references that do not apply. It is
worth writing down how, because the mechanism is not the one the plan assumed.

The plan expected base to carry every reference and the engine to delete the
irrelevant ones by directory. Instead each reference **ships from the variant
that owns it** — `variants/db-supabase/.claude/skills/niftic-app/references/data.md`
and so on — so the copy pass that already decides which code a profile gets
decides which prose it gets too. There is no second list to keep in sync with
the first, and adding a variant cannot forget to teach its own rules. It also
matches the convention the per-variant `docs/` already established.

Only one reference is genuinely a deletion: `references/setup.md`, the interview.
It lives in base because it is about the unconfigured repo, and it is pruned by
the run it describes. `docs/architecture.md` — this file — is pruned for the
same reason: it documents an engine that no longer exists by the time anyone
reads it in a generated app.

`SKILL.md` itself is base and survives, so its capability-dependent procedures
(add an upload, add a role) reach apps that have no storage and no auth. Rather
than generate the file per profile, the skill states the rule that makes the
dead parts inert: a procedure whose reference was pruned is a procedure this app
has no use for. The static profile, where most of them are dead at once, ships a
`static.md` that says what the profile _is_ instead of listing what it lacks.

`CLAUDE.md` could not take the same route. The starter's own describes a
superset and a configure engine, which is exactly wrong for a generated app, so
it is the ninth generator: profile, stack, layout and rules assembled from the
resolved manifest, and the command list read from the merged `package.json`
rather than hand-kept — a CLAUDE.md that names a script the app does not have
teaches the agent to distrust the rest of the page.

## What M6 has and has not been run against

Verified locally, for real: the **bootstrap round-trip**. A repo was built from
this tree, a manifest committed, and `bootstrap.yml`'s own `run:` blocks —
extracted from the file, not transcribed — executed against it. It configured,
committed `chore: configure app (turso)` and pushed to a bare remote; a fresh
clone of that remote carries the `generated:` block, the app's `ci.yml` and the
skill, and carries none of `variants/`, the engine, either starter workflow,
`docs/architecture.md` or `references/setup.md`. A second dispatch was refused by
the guard. The same sequence runs in CI as the `bootstrap` job.

Also verified locally: turso, supabase and static configure with the right
references present and no others, and the generated `CLAUDE.md` describes the
app rather than the starter.

**Never run:** a real `workflow_dispatch`. That needs the repo marked as a
template on GitHub and a provisioner to call the API, neither of which exists
yet. What the CI job proves is the contract — configure, commit, push,
self-delete, refuse a second run — not GitHub's dispatch plumbing.

## What M7 found

The grill is spec §14's checklist run against freshly generated apps of all five
presets. Everything below was found by running something, not by reading it —
and every one of them had survived a green CI run, because CI never did the
thing that exposed it.

**The Supabase profile 500'd on every server request.** `PUBLIC_SUPABASE_URL`
and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` were required fields in the generated
server env schema, and SvelteKit excludes anything carrying the public prefix
from `$env/dynamic/private` by design — so `env()` threw on every request that
touched it, no matter what the operator set. `/api/health` was a 500. The app
code was never wrong: it reads those two through `$env/dynamic/public` in
`supabase-config.ts`. The generator was, by putting every declared variable into
the private schema. It now skips `PUBLIC_`-prefixed names, which still appear in
`.env.example` because the public loader needs them just the same.

Nothing caught this because nothing had ever sent a request to a Supabase app:
the preset lane stops at `pnpm build`, and the integration lane's smokes sit
behind a types-drift check that has never passed. `PUBLIC_APP_NAME` has the same
shape on every other profile and is harmless only because it is optional.

**The service-role import boundary was documented in three places and enforced
in none.** `service-client.ts`, the skill reference and the README all said
ESLint refused the import outside `$lib/server/admin/`. It did not: the rule
restricts SDK _packages_, and the service client is a local module, so any route
could import it and skip every policy while passing lint. Two admin routes
already did — one of them under a comment asserting the opposite.

Fixed on both sides: `no-restricted-imports` now carries a pattern confining
`$lib/server/admin/service-client`, and the admin screens call named helpers
(`listProfiles`, `setProfileRole`, `recentAuditEntries`) that live beside it. The
first attempt banned the whole directory and broke those same screens, which is
the useful shape of the rule — the client is confined, the privileged operations
are callable.

**`pnpm build` followed by `pnpm lint` reported 912 errors.** ESLint's ignore
list had fallen behind `.prettierignore`: no `.vercel/`, and no `coverage/`,
`test-results/` or `playwright-report/` either. CI lints before it builds, so CI
never saw it; a developer does the opposite and sees it immediately.

**The static-lockfile check asked a weaker question than it claimed.** It looked
for `node_modules/<pkg>`, but pnpm's isolated layout puts a transitive
dependency under `.pnpm/` and nowhere else — so the check could only ever catch
a _declared_ one, which is not the leak worth worrying about. The ground truth
turned out to be clean (no db, auth or storage package anywhere in a static
app's tree, and zero mentions in its lockfile), so this was a check that passed
for the wrong reason. It now searches both.

**The honeypot named itself.** A bot filling `company_website` got
`{"errors":{"company_website":["Rejected"]}}` — the exact free advice the
schema's own comment refuses to give. The JSON path now strips the trap's error;
genuine field errors still come back.

## Policies are not privileges

The first time a policy test ever queried these tables — run #5, the first run
to reach that step — every one of them answered `permission denied for table
notes` (42501), the owner's own select included. No migration on this branch
contained a single `grant`.

RLS filters rows **within** what a role may already touch. Postgres checks table
privileges first, so a table with perfect policies and no grant refuses
everything, and the refusal looks exactly like a policy bug. Supabase's default
privileges did not cover it, which depends on the role migrations happen to run
as — so the grants are now explicit in each migration, matching each table's
policy surface verb for verb. `audit_log` grants to `service_role` alone: no
policies plus no privileges is the strongest form of "not yours", and the
service role bypasses RLS but not privileges.

The nastier half is what this did to the tests. Of five policy tests, three
passed — and the ones asserting that an attacker is REFUSED would have passed
either way, because "refused by policy" and "refused for lack of privilege" are
indistinguishable from the client. A green policy suite on an ungranted table
proves nothing at all. `check:rls` now fails a created table that grants to
nobody, which is the cheapest place to catch it: it reads SQL, needs no
database, and runs before anything is applied.

## What M7 has and has not been run against

Verified by running it, on all five presets: configure, install, check, lint,
unit tests and build; nothing starter-only surviving; no canary credential in
any client bundle. Booted with a real server and asked `/api/health`: turso and
sqlite report healthy, static reports healthy, supabase reports `degraded` with
an honest per-check breakdown (no local stack for storage). SQLite's database
file was confirmed to be in WAL mode after boot. The contact endpoint was driven
through valid, invalid, honeypot and missing-origin cases — 200, 400, 400, 403.
Every legality rule was provoked and produced its own message.

**Not run:** the real Vercel deploy of the turso preset (§14 item 3), which
needs an account and real provisioned services. The container drill and the
Supabase policy tests remain CI's to prove — no Docker on this machine. The
skill's triggering behaviour (§14 item 10) is a property of a model reading a
description, not something a shell can assert; what was checked is that its
content covers the four refusals the item lists.

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
