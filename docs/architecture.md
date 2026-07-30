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
needing its own variant. One mechanism, two axes.

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

## A gap in the spec's legality rules

Spec §3 rule 3 forbids `storage: r2` on the Supabase branch, to keep the fork
clean. The converse was not stated but follows from the same principle, and is
enforced: **`storage: supabase` requires `data: supabase`**
(`E_STORAGE_SUPABASE_DATA`). Supabase Storage lives in the Supabase project and is
governed by its RLS policies; on another data branch there is no project to hold
the bucket and no policy layer to authorize it.

The host × data matrix entries marked "not in v1" (supabase or static on Dokploy)
are **warnings**, not errors — they are a support statement rather than a physical
constraint, unlike the SQLite rules which describe something that genuinely
cannot work.
