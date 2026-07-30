/**
 * Connection options for postgres-js, and the two rules this branch refuses to
 * boot without.
 *
 * Pure and free of `$lib/server/env` on purpose: the rules are the interesting
 * part and they are worth testing directly, without SvelteKit's env.
 *
 * Spec §3 rule 6 is a documentation rule at configure time — whether a
 * connection string is pooled is a runtime property the engine cannot see. This
 * is where it stops being documentation.
 */

export type DbHost = 'vercel' | 'dokploy';

export interface ConnectionOptions {
	max: number;
	/**
	 * Always off. NOT because the pooler cannot cope — PgDog does support
	 * prepared statements in transaction mode, unlike PgBouncer, by caching each
	 * statement globally and mapping names per client. Off anyway for two
	 * reasons that outlive the pooler choice:
	 *
	 *  - Every serverless instance re-parses every statement into the pooler's
	 *    global cache (default 500 entries) and then freezes. Many short-lived
	 *    instances × many distinct queries is cache pressure bought with nothing.
	 *  - It is the setting that stays correct if this ever points at PgBouncer, a
	 *    provider's own transaction pooler, or `statement` mode.
	 */
	prepare: false;
	ssl: 'require' | false;
	connect_timeout: number;
	idle_timeout: number | undefined;
}

/** Hostnames that mean "this machine": local dev, and the CI service container. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function isLoopback(hostname: string): boolean {
	return LOOPBACK.has(hostname.replace(/^\[|\]$/g, ''));
}

export class DatabaseUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DatabaseUrlError';
	}
}

/**
 * Options for one connection string, or a refusal.
 *
 * The refusals only ever apply to a REMOTE host. A loopback URL is local dev or
 * the CI service container: no TLS to require, no pooler in front, and failing
 * there would mean the rule could never be tested by running it.
 */
export function connectionOptions(url: string, host: DbHost): ConnectionOptions {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		// Never echo the value — this can reach a log aggregator, and the value is
		// a credential.
		throw new DatabaseUrlError('DATABASE_URL is not a valid connection URL.');
	}

	const local = isLoopback(parsed.hostname);
	const sslMode = parsed.searchParams.get('sslmode');

	if (!local && sslMode === 'disable') {
		throw new DatabaseUrlError(
			'DATABASE_URL has sslmode=disable, but this database is not on this machine. ' +
				'Traffic between the app and the pooler must be encrypted. See docs/postgres-pooling.md.'
		);
	}

	// A remote database reached on the default Postgres port is the shape of a
	// bare, unpooled connection — and from Vercel that is the failure this whole
	// branch is arranged to prevent: every function instance opens its own
	// backend and the server runs out of connections under load. PgDog listens on
	// 6432. If yours genuinely does not, this is your app now: change the line.
	const port = parsed.port || '5432';
	if (!local && host === 'vercel' && port === '5432') {
		throw new DatabaseUrlError(
			`DATABASE_URL points at port ${port}, which is the default Postgres port and ` +
				'therefore almost certainly a direct connection. From Vercel it must go ' +
				'through the pooler (PgDog listens on 6432). See docs/postgres-pooling.md.'
		);
	}

	return {
		// Vercel gives each instance its own client and freezes it between
		// invocations, so a big pool per instance just holds pooler slots hostage.
		// A long-lived Node process on Dokploy can use the driver's own default.
		max: host === 'vercel' ? 5 : 10,
		prepare: false,
		ssl: local ? false : 'require',
		connect_timeout: 10,
		// Hand connections back quickly where instances are ephemeral; keep them
		// where the process is not.
		idle_timeout: host === 'vercel' ? 20 : undefined
	};
}
