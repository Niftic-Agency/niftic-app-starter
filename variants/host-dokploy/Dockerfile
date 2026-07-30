# Multi-stage build for the Dokploy host.
#
# Three stages so the runner carries no build toolchain and no source: deps
# installs, build compiles, runner runs. `node:24-slim` rather than alpine —
# libSQL ships a native binding and musl builds of it are a support problem
# nobody here wants to own.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:24-slim AS deps
RUN corepack enable
WORKDIR /app

# Copied alone so this layer is cached against every change that is not a
# dependency change, which is almost all of them.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# adapter-node's defaults. HOST must be 0.0.0.0 for the platform proxy to reach
# the container at all; ORIGIN comes from the environment and must match the
# public URL or every form POST fails the origin check.
ENV HOST=0.0.0.0
ENV PORT=3000

# Litestream is a single static binary and is installed unconditionally, because
# a Dockerfile cannot branch on the profile. The entrypoint uses it only when
# litestream.yml is present — that is, only on the sqlite profile. ~10MB for the
# postgres-on-dokploy case, which is the cheapest way to keep one Dockerfile.
# curl stays for the HEALTHCHECK below.
ARG LITESTREAM_VERSION=0.5.15
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl \
	# The release assets are named x86_64/arm64, while dpkg says amd64/arm64 —
	# and the filename carries no `v` even though the tag does. Both are easy to
	# get wrong and produce a 404 at build time.
	&& case "$(dpkg --print-architecture)" in \
		amd64) LS_ARCH=x86_64 ;; \
		arm64) LS_ARCH=arm64 ;; \
		*) echo "unsupported architecture" >&2; exit 1 ;; \
	esac \
	&& curl -fsSL -o /tmp/litestream.tar.gz \
		"https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${LS_ARCH}.tar.gz" \
	&& tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz litestream \
	&& rm /tmp/litestream.tar.gz \
	&& rm -rf /var/lib/apt/lists/*

# node_modules is copied whole rather than pruned to production. The boot
# migration runs `scripts/migrate.ts` through tsx, which is a devDependency, and
# a real `dependencies` entry for it would leave tsx listed twice in the
# generated package.json. The image is a few hundred MB larger; the alternative
# was a lie in the manifest.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
# Migrations, the script that applies them, and the schema modules that script
# imports. Nothing else from src reaches the runner.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib/server/db ./src/lib/server/db
COPY --from=build /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# The `node` user ships with the image. The volume must be writable by uid 1000;
# the deploy doc says so, because a read-only volume shows up as a confusing
# SQLITE_CANTOPEN rather than a permissions error.
RUN mkdir -p /data && chown -R node:node /app /data
USER node

VOLUME ["/data"]
EXPOSE 3000

# Dokploy and any uptime monitor point at the same endpoint the app reports its
# own health on. start-period covers restore-and-migrate on a cold volume.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
	CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
