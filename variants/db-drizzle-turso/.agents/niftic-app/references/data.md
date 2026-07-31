# Data — Drizzle on libSQL

SQLite dialect, whether the database is Turso over the network or a file on a
volume. `src/lib/app-config.ts` says which.

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

## Tables and migrations

Schema modules live in `src/lib/server/db/schema/` and are re-exported from a
generated barrel — add the module, and the barrel picks it up at setup time; in
a configured app, add the export yourself.

```bash
pnpm db:generate   # drizzle-kit writes SQL into drizzle/ from the schema
pnpm db:migrate    # applies it
```

Commit the generated SQL with the schema change that produced it. Never edit a
migration that has been applied anywhere — write another one.

Keep the SQL SQLite-compatible: no `jsonb`, no arrays, no `gen_random_uuid()`.
Ids are ULIDs generated in the application (`ulid()`), which sort by creation
time and avoid a round trip. Timestamps are stored as integers and handed to
Drizzle as `Date`.

## What to test, and where

Vitest covers the pure parts — validation (`src/lib/notes/schema.test.ts`) and
permissions. Where a test needs a database it opens a real `file:` one and runs
the real migrations, the way `src/lib/server/db/pragmas.test.ts` does; never
mock Drizzle, because a mocked query proves nothing about the SQL.

Authorization is proved in the Playwright smokes under `tests/`, where a second
signed-in user tries to read and to mutate the first user's row. That refusal is
the assertion that matters most in this app, and it only means something against
a running server.

## Local database

`TURSO_DATABASE_URL` accepts `file:./.data/app.db` for local work, so no service
is needed to run the app or its tests. Point it at the Turso URL plus
`TURSO_AUTH_TOKEN` when you want the real thing.
