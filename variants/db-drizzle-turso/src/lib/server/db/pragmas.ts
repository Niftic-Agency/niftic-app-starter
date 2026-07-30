/**
 * Pragmas for a file-backed database.
 *
 * Pure, and free of `$lib` imports on purpose: the app path
 * (`src/lib/server/db/index.ts`) and the script path (`scripts/db-connect.ts`)
 * both need these, and the scripts run under plain tsx where `$lib` does not
 * resolve. Same seam as `connection.ts` on the Postgres branch.
 *
 * Two of the four are per-CONNECTION and reset every time, which is why this
 * runs on the client rather than once in a migration. Measured against
 * @libsql/client on a fresh file, not assumed:
 *
 *   journal_mode  delete → must be set; PERSISTS in the file afterwards
 *   busy_timeout  0      → must be set on EVERY connection
 *   foreign_keys  1      → already on; libSQL differs from plain SQLite here
 *   synchronous   2 FULL → must be set on EVERY connection
 */

export const FILE_PRAGMAS = [
	// What lets readers and the writer coexist, and what Litestream replicates.
	// It also has to be set BEFORE Litestream attaches, which is why the boot
	// migration applies these too — otherwise the entrypoint hands Litestream a
	// database still in rollback-journal mode.
	'journal_mode = WAL',
	// Without it a concurrent write fails instantly with SQLITE_BUSY rather than
	// waiting for the lock. The single most valuable line here.
	'busy_timeout = 5000',
	// Already the libSQL default. Stated anyway: a guarantee this app relies on
	// should be visible, not inherited.
	'foreign_keys = ON',
	// The right trade under WAL. Still durable across a process crash; a machine
	// losing power can cost the last transactions, which is what the Litestream
	// replica is for.
	'synchronous = NORMAL'
] as const;

/** Only a local file has these to set — hosted libSQL ignores the whole idea. */
export function isFileUrl(url: string): boolean {
	return url.startsWith('file:');
}

interface PragmaClient {
	execute(sql: string): Promise<unknown>;
}

/**
 * Not awaited, and that is safe rather than sloppy: the file-backed libSQL
 * client serialises statements on one connection in call order, so anything
 * issued afterwards already sees these. Verified by experiment.
 *
 * `onError` is not optional — an unhandled rejection here would take the process
 * down at boot, and a pragma that failed is worth a loud log, not a crash.
 */
export function applyFilePragmas(
	client: PragmaClient,
	onError: (pragma: string, error: unknown) => void
): void {
	for (const pragma of FILE_PRAGMAS) {
		client.execute(`PRAGMA ${pragma}`).catch((error: unknown) => onError(pragma, error));
	}
}
