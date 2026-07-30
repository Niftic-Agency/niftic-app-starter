/**
 * Attachment handling when the app has no storage.
 *
 * Same surface as `attachment.r2.ts`, so the routes import it either way and
 * carry no branching of their own. Any key that somehow arrives is dropped:
 * there is no bucket to hold it and nothing to authorize it against.
 */
export function acceptAttachment(_key: string | null | undefined, _userId: string): string | null {
	return null;
}

export const attachmentsEnabled = false;
