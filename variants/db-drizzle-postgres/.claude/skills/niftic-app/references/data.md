# Data — Drizzle on Postgres

Postgres dialect through postgres-js. `docs/postgres-pooling.md` is the runbook
for the connection itself; this file is about writing code against it.

## The repository layer

Every query lives in `src/lib/server/db/repos/`. Routes import repository
functions; routes never import Drizzle. That rule is what makes the SQL
auditable in one place — read `repos/notes.ts` before writing a new one, and
copy the shape of its functions, not just their names.

Ownership is a **required argument**, never an optional filter:

```ts
getNote(id: string, userId: string)   // a wrong id and someone else's id
                                      // are indistinguishable from outside
```

A repository whose `get(id)` can be called without an owner will eventually be
called without one. Where this app has organizations, the scope argument is the
membership rather than the user — see `references/orgs.md`.

## The connection is pooled, and the code has to assume it

`src/lib/server/db/connection.ts` refuses a connection string that is direct or
untrusted, and it is the single source of truth for why — read its comments
before changing anything about the URL. Two consequences for day-to-day code:

- `prepare: false` is set, because a transaction-pooled connection is not the
  same backend twice. Do not reach for prepared statements or session state.
- Nothing that depends on a session lives across requests: no `SET` that must
  persist, no advisory lock held between calls, no `LISTEN`.

## Tables and migrations

```bash
pnpm db:generate   # drizzle-kit writes SQL into drizzle/ from the schema
pnpm db:migrate    # applies it
```

Commit the generated SQL with the schema change that produced it. Never edit a
migration that has been applied anywhere — write another one.

On the Vercel host, migrations are applied deliberately rather than on boot; on
Dokploy the container applies them as it starts. Either way the migration is in
the commit.

Postgres types are available here — `jsonb`, arrays, real `timestamptz` — and
using them is fine. Ids stay ULIDs generated in the application, so a row's id
is known before the insert returns.

## What to test, and where

Vitest runs without a database on this branch: it covers validation, permissions
and the connection rules themselves (`connection.test.ts` asserts the refusals,
which is the cheapest place to keep them honest). Never mock Drizzle to fake a
query — a mocked query proves nothing about the SQL.

Anything that needs a server belongs in the Playwright smokes under `tests/`,
which CI runs against a real `postgres:17`. Authorization is proved there: a
second signed-in user tries to read and to mutate the first user's row and is
refused at both.
