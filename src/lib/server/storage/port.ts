/**
 * One storage port, two implementations (R2 and Supabase Storage), chosen at
 * setup. Application code only ever sees this interface, so the upload and
 * download flows are identical on both branches.
 *
 * The shape of the flow matters more than the interface: the browser asks the
 * server for a short-lived signed URL, uploads directly to the bucket, and the
 * server records the key. No storage credential ever reaches the client, and
 * the app never proxies file bytes.
 */

export interface UploadTarget {
	url: string;
	headers?: Record<string, string>;
}

export interface StoragePort {
	createUploadUrl(opts: {
		key: string;
		contentType: string;
		maxBytes: number;
	}): Promise<UploadTarget>;
	createDownloadUrl(key: string, opts?: { expiresIn?: number }): Promise<string>;
	delete(key: string): Promise<void>;
}

// ─── key construction ────────────────────────────────────────────────────────

/** Bytes. Anything larger should be a deliberate, reviewed decision. */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export const DEFAULT_ALLOWED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'application/pdf',
	'text/plain',
	'text/csv'
] as const;

/**
 * Reduce a user-supplied filename to something safe to put in an object key.
 *
 * The filename is attacker-controlled. Every rule here closes a specific hole:
 * path separators and `..` would let a key escape its prefix; leading dots
 * create hidden files; control characters and quotes break the
 * Content-Disposition header we later echo; and an unbounded length blows past
 * the key limit.
 */
export function safeName(input: string): string {
	// Take the basename only — "../../etc/passwd" becomes "passwd".
	const base = input.split(/[/\\]/).pop() ?? '';

	const cleaned = base
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/[^a-zA-Z0-9._-]/g, '-')
		.replace(/^\.+/, '')
		.replace(/-{2,}/g, '-')
		.replace(/^[-.]+|[-.]+$/g, '');

	if (!cleaned) return 'file';

	// Keep the extension when truncating; the tail is what tools look at.
	if (cleaned.length <= 100) return cleaned;
	const dot = cleaned.lastIndexOf('.');
	if (dot <= 0 || cleaned.length - dot > 12) return cleaned.slice(0, 100);
	return cleaned.slice(0, 100 - (cleaned.length - dot)) + cleaned.slice(dot);
}

/**
 * `uploads/{userId}/{id}-{safe-name}`.
 *
 * The user id prefix is what makes ownership checkable from the key alone, and
 * the random id prevents one upload from overwriting another with the same
 * filename.
 */
export function uploadKey(userId: string, id: string, filename: string): string {
	return `uploads/${encodeURIComponent(userId)}/${id}-${safeName(filename)}`;
}

export interface ValidationResult {
	ok: boolean;
	error?: string;
}

export function validateUpload(input: {
	contentType: string;
	size: number;
	allowedTypes?: readonly string[];
	maxBytes?: number;
}): ValidationResult {
	const allowed = input.allowedTypes ?? DEFAULT_ALLOWED_TYPES;
	const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;

	// Strip any `; charset=` parameter before comparing.
	const type = input.contentType.split(';')[0]?.trim().toLowerCase() ?? '';

	if (!allowed.includes(type))
		return { ok: false, error: `Files of type ${type || 'unknown'} aren't allowed.` };
	if (!Number.isFinite(input.size) || input.size <= 0)
		return { ok: false, error: 'Invalid file size.' };
	if (input.size > maxBytes) {
		return { ok: false, error: `Files must be under ${Math.floor(maxBytes / 1024 / 1024)}MB.` };
	}

	return { ok: true };
}

/**
 * The server must never sign a key the caller handed it verbatim. Download
 * requests arrive with a key in the URL, so re-derive ownership from its shape
 * rather than trusting a database lookup alone.
 */
export function keyBelongsTo(key: string, userId: string): boolean {
	return key.startsWith(`uploads/${encodeURIComponent(userId)}/`);
}
