# Deploying to Dokploy

This app builds into a container and runs as a long-lived Node process behind
Dokploy's proxy. The image is built from the `Dockerfile` in this repo; Dokploy
builds it on push.

## Once, when you create the app

1. **Create the application** in Dokploy from this GitHub repository, build type
   **Dockerfile**.

2. **Attach a volume** — sqlite profile only. Mount path `/data`, and the
   database lives at `/data/app.db`. It must be a real local volume: never NFS,
   EFS, or anything else over a network. SQLite's locking assumes a local
   filesystem, and the failure mode is corruption rather than an error.

   The volume must be writable by uid 1000 — the container runs as the `node`
   user, not root. A read-only mount surfaces as `SQLITE_CANTOPEN`, which reads
   like a missing file rather than a permissions problem.

3. **Set the environment** from `.env.example`. Everything marked required is
   required. `ORIGIN` must be the public URL exactly: adapter-node checks the
   request origin against it, and a mismatch fails every form POST with a 403
   that looks like a CSRF bug.

4. **Set the domain** and let Dokploy issue the certificate.

5. **Replicas: 1.** Not a default to adjust later — see below.

6. **Enable deploy on push.**

## Replicas must stay at 1

`pnpm configure` refuses a manifest that says otherwise, and the reason is
physical rather than cautious: two processes writing one SQLite file corrupt it,
and Litestream assumes it is the only replicator of that file. Scaling out means
moving to the `postgres` profile — a documented migration, not a slider.

For a Postgres app on this host the constraint does not apply, but the manifest
still records the replica count so the deploy docs and CI agree with reality.

## What happens on each deploy

`entrypoint.sh` runs before anything serves:

- **sqlite:** restore from the replica if the volume is empty → apply migrations
  → start the app under `litestream replicate -exec`.
- **postgres:** apply migrations → start the app.

Migrations run here rather than in CI because this host has a boot hook and
Vercel does not. They are idempotent; a redeploy that applies nothing is normal.

If the container will not start, read the logs from the top — the entrypoint
prints each phase, so you can tell a restore failure from a migration failure
from the app failing to bind.

## Health

`/api/health` is what the container's `HEALTHCHECK` polls and what an uptime
monitor should point at. It reports the database, storage and email checks that
apply to this profile. The healthcheck's `start-period` is 40s, which covers a
cold-volume restore and migrate; a slower first boot than that will show as
unhealthy before it is ready.

## Rolling back

Redeploy the previous commit from Dokploy. Note what that does **not** do: it
does not roll back migrations. A deploy that migrated the database and then
failed leaves the schema ahead of the code, and the fix is forward — write the
migration that undoes it — not backward.

For the sqlite profile, a rollback that needs the data as it was at a point in
time is a Litestream restore, not a redeploy. See
[sqlite-litestream.md](sqlite-litestream.md).

## Preview environments

A preview must never share production's resources. Separate volume, separate
database, separate auth secret, separate bucket — or uploads disabled entirely.
A preview pointing at the production Litestream bucket will replicate over the
production recovery chain, which is the worst version of this mistake.
