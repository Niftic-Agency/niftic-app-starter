import { keyBelongsTo } from '$lib/server/storage';

/**
 * Attachment handling when the app has storage.
 *
 * The counterpart `attachment.none.ts` is copied instead when storage is off,
 * so the notes routes can import this unconditionally. That is the whole reason
 * `storage` is a selector group: `has.storage` is a literal type, so it can hide
 * markup but cannot make an import of a module that was never copied resolve.
 */

/**
 * The key arrives in a form field, which means the user controls it. Ownership
 * is re-derived from the key's own prefix rather than trusted — otherwise a note
 * could be made to point at somebody else's object.
 */
export function acceptAttachment(key: string | null | undefined, userId: string): string | null {
	if (!key) return null;
	return keyBelongsTo(key, userId) ? key : null;
}

export const attachmentsEnabled = true;
