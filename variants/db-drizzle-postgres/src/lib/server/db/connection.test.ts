import { describe, expect, it } from 'vitest';
import { connectionOptions, DatabaseUrlError, isLoopback } from './connection';

const REMOTE_POOLED = 'postgres://app:secret@pgdog.internal:6432/app';
const REMOTE_DIRECT = 'postgres://app:secret@db.internal:5432/app';
const LOCAL = 'postgres://postgres:postgres@localhost:5432/app';

describe('isLoopback', () => {
	it('recognises the forms a local database actually arrives as', () => {
		expect(isLoopback('localhost')).toBe(true);
		expect(isLoopback('127.0.0.1')).toBe(true);
		expect(isLoopback('::1')).toBe(true);
		// URL parsing strips the brackets from an IPv6 host, but not always.
		expect(isLoopback('[::1]')).toBe(true);
	});

	it('does not treat a remote host as local', () => {
		expect(isLoopback('pgdog.internal')).toBe(false);
		expect(isLoopback('10.0.0.5')).toBe(false);
		// A hostname that merely contains "localhost" is not localhost.
		expect(isLoopback('localhost.evil.example')).toBe(false);
	});
});

describe('connectionOptions', () => {
	it('accepts a pooled TLS connection from Vercel', () => {
		const options = connectionOptions(REMOTE_POOLED, 'vercel');
		expect(options.ssl).toBe('require');
		expect(options.prepare).toBe(false);
		expect(options.max).toBe(5);
	});

	it('refuses a direct connection from Vercel — the whole point of rule 6', () => {
		expect(() => connectionOptions(REMOTE_DIRECT, 'vercel')).toThrow(DatabaseUrlError);
		// ...including when the port is left implicit, which is the same thing.
		expect(() => connectionOptions('postgres://app:s@db.internal/app', 'vercel')).toThrow(
			DatabaseUrlError
		);
	});

	it('allows the default port on Dokploy, where the database is next door', () => {
		const options = connectionOptions(REMOTE_DIRECT, 'dokploy');
		expect(options.ssl).toBe('require');
		// A long-lived process is not competing with its own instances.
		expect(options.max).toBe(10);
		expect(options.idle_timeout).toBeUndefined();
	});

	it('refuses to send credentials over a remote connection in the clear', () => {
		expect(() => connectionOptions(`${REMOTE_POOLED}?sslmode=disable`, 'vercel')).toThrow(
			DatabaseUrlError
		);
		expect(() => connectionOptions(`${REMOTE_DIRECT}?sslmode=disable`, 'dokploy')).toThrow(
			DatabaseUrlError
		);
	});

	it('leaves a local database alone, so the rules can be tested by running them', () => {
		// Local dev and the CI service container: no pooler, no certificate, and
		// the default port is exactly right.
		const options = connectionOptions(LOCAL, 'vercel');
		expect(options.ssl).toBe(false);
		expect(options.prepare).toBe(false);
	});

	it('never puts the connection string in the error', () => {
		// This message reaches logs. The URL contains the password.
		try {
			connectionOptions(REMOTE_DIRECT, 'vercel');
			expect.unreachable('should have thrown');
		} catch (error) {
			expect((error as Error).message).not.toContain('secret');
			expect((error as Error).message).not.toContain('db.internal');
		}
	});

	it('rejects something that is not a URL at all, without echoing it', () => {
		try {
			connectionOptions('host=db user=app password=hunter2', 'vercel');
			expect.unreachable('should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(DatabaseUrlError);
			expect((error as Error).message).not.toContain('hunter2');
		}
	});
});
