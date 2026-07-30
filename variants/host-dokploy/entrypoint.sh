#!/bin/sh
# Container entrypoint.
#
# One file for both profiles that deploy here. The branch is on whether
# litestream.yml exists, which is exactly the thing that distinguishes them: the
# sqlite profile ships one, the postgres profile does not.

set -eu

MIGRATE="node_modules/.bin/tsx scripts/migrate.ts"

if [ -f /app/litestream.yml ]; then
	# ── sqlite: restore, migrate, then replicate while supervising the app ──
	: "${DB_PATH:?DB_PATH is required on the sqlite profile}"

	# The app reads TURSO_DATABASE_URL; litestream.yml reads DB_PATH. Deriving one
	# from the other here keeps a single source of truth for where the database
	# is, instead of two variables that can disagree.
	export TURSO_DATABASE_URL="file:${DB_PATH}"

	mkdir -p "$(dirname "$DB_PATH")"

	# Idempotent by construction: exit 0 when the database is already on the
	# volume, and exit 0 when no replica exists yet. First deploy against an empty
	# bucket, a redeploy with data intact, and a replacement volume all take this
	# same line.
	echo "litestream: restoring ${DB_PATH} if needed"
	litestream restore -if-db-not-exists -if-replica-exists -config /app/litestream.yml "$DB_PATH"

	echo "migrate: applying migrations"
	$MIGRATE

	# `-exec` makes litestream the parent: it streams writes while the app runs and
	# shuts replication down cleanly when the app exits. `exec` so signals from the
	# platform reach litestream rather than this shell.
	echo "litestream: replicating and starting the app"
	exec litestream replicate -config /app/litestream.yml -exec "node build/index.js"
fi

# ── everything else on this host: migrate, then start ────────────────────────
echo "migrate: applying migrations"
$MIGRATE

echo "starting the app"
exec node build/index.js
