/**
 * JSON-line logger. One line per event on stdout, no dependency.
 *
 * Every host we deploy to (Vercel, Dokploy/Docker) collects stdout, and every
 * log search tool understands JSON lines. Anything structured you want to query
 * later goes in as a field, not interpolated into `msg`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Set once at module load. LOG_LEVEL is read here rather than from $lib/server/env
// because the logger must work before env validation has run (and must never be
// the thing that throws during boot).
const threshold = LEVELS[(globalThis.process?.env?.LOG_LEVEL as LogLevel) ?? 'info'] ?? LEVELS.info;

function emit(level: LogLevel, msg: string, fields: LogFields = {}): void {
	if (LEVELS[level] < threshold) return;

	const line: Record<string, unknown> = {
		ts: new Date().toISOString(),
		level,
		msg,
		...fields
	};

	// Errors don't survive JSON.stringify; unwrap them.
	for (const [key, value] of Object.entries(line)) {
		if (value instanceof Error) {
			line[key] = { name: value.name, message: value.message, stack: value.stack };
		}
	}

	const out = JSON.stringify(line);
	if (level === 'error' || level === 'warn') console.error(out);
	else console.log(out);
}

export const logger = {
	debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
	info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
	warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
	error: (msg: string, fields?: LogFields) => emit('error', msg, fields),

	/** Bind fields (typically `requestId`) onto every subsequent call. */
	child(bound: LogFields) {
		return {
			debug: (msg: string, f?: LogFields) => emit('debug', msg, { ...bound, ...f }),
			info: (msg: string, f?: LogFields) => emit('info', msg, { ...bound, ...f }),
			warn: (msg: string, f?: LogFields) => emit('warn', msg, { ...bound, ...f }),
			error: (msg: string, f?: LogFields) => emit('error', msg, { ...bound, ...f })
		};
	}
};

export type Logger = typeof logger;
