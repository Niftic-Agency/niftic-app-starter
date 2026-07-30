# Postgres through a pooler

This app talks to Postgres through **PgDog** in transaction mode, over TLS. That
is not a tuning preference; it is the only shape that works from Vercel, and it
rules out a handful of things that otherwise look like they should work.

Read this before debugging a connection problem, and before reaching for
`SET`, `LISTEN`, or a session-scoped anything.

## Why a pooler at all

Every Vercel function instance opens its own database client. Traffic that would
be ten connections from a long-lived server becomes hundreds from a fleet of
short-lived instances, and Postgres has a hard `max_connections`. When you cross
it, the failure is not gradual: new connections are refused and the site stops.

A pooler multiplexes thousands of client connections onto a handful of real
backends. PgDog's default mode is `transaction`: your connection is handed a
backend for the duration of a transaction and it goes back in the pool
afterwards. Between statements, you may not be talking to the same backend you
were before — which is where every constraint below comes from.

`src/lib/server/db/connection.ts` refuses to boot on a connection string shaped
like a direct connection: a remote host on Postgres' default port, when the app
is hosted on Vercel. PgDog listens on **6432**. The check has one deliberate
exemption — a loopback host, which is local development and CI, where there is no
pooler and no certificate and the default port is exactly right.

## What transaction mode takes away

**Prepared statements — kept off, but not for the usual reason.** PgDog _does_
support prepared statements in transaction mode, unlike PgBouncer: it caches each
statement globally and maps names per client. The template still sets
`prepare: false`, for two reasons that outlive the choice of pooler. Serverless
instances are short-lived and numerous, so each one re-parses every statement
into a shared cache (500 entries by default) and then freezes — pressure bought
with nothing. And `prepare: false` is the setting that stays correct if this ever
points at PgBouncer, a managed provider's own transaction pooler, or `statement`
mode.

**Session state does not persist.** `SET search_path`, `SET TIME ZONE`, `SET
ROLE` — anything set outside a transaction may land on a backend you never see
again, and may be observed by whoever gets that backend next. PgDog tracks and
restores connection parameters per client, but do not build on it: set what you
need inside the transaction that needs it, or put it in the connection string.

**`LISTEN` / `NOTIFY` does not work.** A listener needs a backend that stays
yours. It will not. If you want a queue, use a table and poll it, or use
something outside Postgres.

**Advisory locks pin a backend.** PgDog holds the connection to your client until
`pg_advisory_unlock` or disconnect. It is correct, and it defeats the pooling —
one forgotten unlock takes a backend out of circulation. Prefer a row lock inside
a transaction.

**Temporary tables and cursors live only inside a transaction.** `CREATE TEMP
TABLE` outside one is gone by the next statement, or worse, is not.

## Migrations

`pnpm db:migrate` runs `scripts/migrate.ts`. Drizzle wraps each migration in a
transaction, so it is safe through a transaction pooler. Point it at the database
directly when you have the choice: DDL blocked behind a pooler queue is a
confusing way to spend an outage.

- **Host `vercel`:** migrations run from CI on main. Vercel has no boot hook, and
  running them from a request handler means every instance racing the same DDL.
- **Host `dokploy`:** the container entrypoint runs them before starting the
  server.

Migrations are always committed. Generate them with `pnpm db:generate` and read
the SQL before committing — drizzle-kit is good, but a column rename it reads as
a drop-and-add is a data loss bug you get to keep.

## Connection settings, and why

Set in `src/lib/server/db/connection.ts`:

| Setting           | Vercel    | Dokploy   | Why                                                                                                       |
| ----------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------- |
| `max`             | 5         | 10        | Each Vercel instance gets its own pool and then freezes. A big pool per instance just holds pooler slots. |
| `prepare`         | `false`   | `false`   | See above.                                                                                                |
| `ssl`             | `require` | `require` | Credentials and data crossing a network. Loopback is exempt.                                              |
| `idle_timeout`    | 20s       | none      | Hand slots back where instances are ephemeral; keep them where the process is not.                        |
| `connect_timeout` | 10s       | 10s       | Fail a request rather than hold it open against a pooler that is not answering.                           |

## Checklist for a new environment

- `DATABASE_URL` points at the pooler, on its port, with `sslmode=require`.
- Preview deployments have their **own** database. A preview sharing production's
  is one careless migration away from an incident.
- `max_connections` on the server is sized for the pooler's backends, not for
  your app's instance count.
- The app boots. If `connection.ts` refuses it, it is telling you the string is
  direct — fix the string rather than the check.
