import { describe, expect, it, vi } from 'vitest';
import { applyFilePragmas, FILE_PRAGMAS, isFileUrl } from './pragmas';

describe('isFileUrl', () => {
	it('recognises a local file database', () => {
		expect(isFileUrl('file:./.data/dev.db')).toBe(true);
		expect(isFileUrl('file:/data/app.db')).toBe(true);
	});

	it('leaves hosted libSQL alone — these pragmas mean nothing there', () => {
		expect(isFileUrl('libsql://app-org.turso.io')).toBe(false);
		expect(isFileUrl('https://app-org.turso.io')).toBe(false);
	});
});

describe('FILE_PRAGMAS', () => {
	it('sets the two that do not persist across connections', () => {
		// busy_timeout defaults to 0 and synchronous to FULL on every new
		// connection, measured against @libsql/client. Losing either of these is
		// silent: the first shows up as SQLITE_BUSY under load, the second as
		// throughput nobody can explain.
		const joined = FILE_PRAGMAS.join(' ');
		expect(joined).toContain('busy_timeout');
		expect(joined).toContain('synchronous');
	});

	it('puts journal_mode first, because Litestream attaches to a WAL database', () => {
		expect(FILE_PRAGMAS[0]).toBe('journal_mode = WAL');
	});
});

describe('applyFilePragmas', () => {
	it('issues every pragma, in order', () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		applyFilePragmas({ execute }, () => {});

		expect(execute.mock.calls.map(([sql]) => sql)).toEqual(FILE_PRAGMAS.map((p) => `PRAGMA ${p}`));
	});

	it('reports a failure instead of rejecting', async () => {
		// An unhandled rejection here would take the process down at boot, and a
		// pragma that failed deserves a loud log rather than a crash.
		const execute = vi.fn().mockRejectedValue(new Error('disk is read-only'));
		const onError = vi.fn();

		expect(() => applyFilePragmas({ execute }, onError)).not.toThrow();

		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(FILE_PRAGMAS.length));
		expect(onError.mock.calls[0][0]).toBe(FILE_PRAGMAS[0]);
	});
});
