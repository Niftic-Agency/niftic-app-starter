# SQLite and Litestream

This app keeps its database in a single file on a mounted volume, and Litestream
streams every write to object storage a second behind. That combination is why
it can serve real traffic without a database server — and it comes with rules
that are not negotiable, because breaking them is silent until the day you need
the backup.

## The rules

**One replica. Exactly one.** `deployment.replicas` is 1 and `pnpm configure`
refuses anything else. Two processes writing one SQLite file corrupt it, and
Litestream assumes it is the only thing replicating that file. Scaling out means
moving to the `postgres` profile, which is a documented migration, not a slider.

**The file and the process share a host and a volume.** `DB_PATH` points at the
mounted volume. Never put it on NFS, EFS, or any network filesystem: SQLite's
locking depends on the guarantees a local filesystem makes and a network one
does not, and the failure is corruption rather than an error.

**Never put a lifecycle deletion rule on the `litestream/` prefix.** A restore
replays the last snapshot plus every WAL frame after it. A lifecycle rule that
deletes "old objects" removes the middle of that chain, and the replica keeps
looking healthy right up until a restore produces a database that is missing a
week. The bucket is dedicated (`nf-{slug}-{env}-backups`) so no rule aimed at
anything else can reach it.

**The backups bucket is not the uploads bucket**, and it has its own R2 token.
An app credential that can delete backups is one bug away from deleting backups.

## How boot works

`entrypoint.sh`, in order:

```sh
litestream restore -if-db-not-exists -if-replica-exists "$DB_PATH"
node_modules/.bin/tsx scripts/migrate.ts
exec litestream replicate -exec "node build/index.js"
```

1. **Restore.** Both flags make it idempotent: exit 0 if the database is already
   on the volume, and exit 0 if there is no replica yet. So a first deploy with
   an empty bucket, a redeploy with data intact, and a replacement volume that
   needs the backup all take the same path.
2. **Migrate.** On the volume, before anything serves. Vercel has no boot hook,
   which is why the other profiles migrate from CI — here there is one.
3. **Replicate, supervising the app.** `-exec` makes Litestream the parent
   process: it starts the app, streams writes while it runs, and shuts the
   replication down cleanly when the app exits. If the app dies, the container
   dies, and the platform restarts it — which is what you want, because a
   replica running without an app is a replica of nothing.

## The restore drill

Do this monthly. A backup nobody has restored is a hypothesis.

```sh
# 1. From your machine, with the backups credentials exported.
export LITESTREAM_ACCESS_KEY_ID=...
export LITESTREAM_SECRET_ACCESS_KEY=...

# 2. Restore the newest snapshot to a scratch file. Never to DB_PATH.
litestream restore \
  -config ./litestream.yml \
  -o /tmp/restore-check.db \
  "$DB_PATH"

# 3. It must be a real database, not a zero-byte file.
sqlite3 /tmp/restore-check.db "pragma integrity_check;"        # -> ok
sqlite3 /tmp/restore-check.db "select count(*) from user;"     # -> plausible
sqlite3 /tmp/restore-check.db \
  "select max(created_at) from session;"                       # -> recent

# 4. Point-in-time, to prove the WAL chain is intact and not just the snapshot.
litestream restore -config ./litestream.yml \
  -timestamp "$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')" \
  -o /tmp/restore-1h.db "$DB_PATH"
sqlite3 /tmp/restore-1h.db "pragma integrity_check;"

rm -f /tmp/restore-check.db /tmp/restore-1h.db
```

If step 4 fails but step 3 passes, the snapshot is fine and the WAL chain is
broken — which is what a lifecycle rule on the prefix looks like. Fix that before
you need it.

## Recovering for real

Same command, different destination, and stop the app first so nothing writes
underneath you:

```sh
# On the host, with the app stopped.
mv "$DB_PATH" "$DB_PATH.corrupt-$(date +%s)"     # keep it; it is evidence
litestream restore -config /app/litestream.yml "$DB_PATH"
```

Then start the app. The entrypoint's `-if-db-not-exists` makes this safe to do
by hand: on the next boot it sees a database and leaves it alone.

Keep the corrupt file. If you replaced it because of a bug rather than hardware,
it is the only copy of what the bug did.

## Pragmas

Set on every connection in `src/lib/server/db/index.ts`, and worth knowing about
because two of them do not persist:

| Pragma         | Value    | Persists?                                   |
| -------------- | -------- | ------------------------------------------- |
| `journal_mode` | `WAL`    | Yes — stored in the file                    |
| `busy_timeout` | `5000`   | **No** — per connection, defaults to 0      |
| `foreign_keys` | `ON`     | Already the libSQL default                  |
| `synchronous`  | `NORMAL` | **No** — per connection, defaults to `FULL` |

`synchronous = NORMAL` under WAL survives a process crash but can lose the last
transactions if the machine loses power. That is the trade this profile makes,
and the replica — a second behind — is the other half of it.
