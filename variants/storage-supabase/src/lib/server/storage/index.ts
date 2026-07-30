import { getRequestEvent } from '$app/server';
import { supabase } from '$lib/server/supabase';
import type { StoragePort, UploadTarget } from './port';

/**
 * Supabase Storage implementation of the storage port.
 *
 * Same shape as the R2 implementation on purpose: the browser asks the server
 * for a short-lived signed URL, uploads straight to the bucket, and the server
 * records the key. No storage credential reaches the client and the app never
 * proxies file bytes.
 *
 * Two things worth knowing, both checked against storage-js rather than assumed:
 *
 * 1. `createSignedUploadUrl` returns `{ signedUrl, token, path }` and the token
 *    is already IN the URL. A plain `PUT` to that URL with a `content-type`
 *    header is exactly what the library's own `uploadToSignedUrl` performs, so
 *    the client-side flow is byte-for-byte the one the R2 branch uses.
 * 2. There is no size parameter. R2 enforces the cap through the signed
 *    `Content-Length`; here the bucket's `file_size_limit` does it, which is set
 *    in `supabase/config.toml` locally and in the dashboard for the project.
 *    That is a real difference between the branches and it is why the bucket
 *    limit is not optional.
 *
 * The bucket is PRIVATE. Everything is reached through a signed URL, and the
 * bucket's own policies (see the migration) are the second lock.
 */

const BUCKET = 'assets';

/** Signed URLs are minted with the caller's own client, so RLS applies. */
function storageApi() {
	return supabase(getRequestEvent()).storage.from(BUCKET);
}

export const storage: StoragePort = {
	async createUploadUrl({ key, contentType }): Promise<UploadTarget> {
		const { data, error } = await storageApi().createSignedUploadUrl(key);

		if (error || !data) {
			throw new Error(`Supabase Storage refused an upload URL: ${error?.message ?? 'unknown'}`);
		}

		return {
			url: data.signedUrl,
			// The browser must send this; the object is stored with whatever type
			// arrives, and a wrong one comes back on download.
			headers: { 'Content-Type': contentType }
		};
	},

	async createDownloadUrl(key, opts): Promise<string> {
		const { data, error } = await storageApi().createSignedUrl(key, opts?.expiresIn ?? 300);

		if (error || !data) {
			throw new Error(`Supabase Storage refused a download URL: ${error?.message ?? 'unknown'}`);
		}

		return data.signedUrl;
	},

	async delete(key): Promise<void> {
		const { error } = await storageApi().remove([key]);

		// Removing something already gone is not an error worth propagating —
		// matching the R2 implementation, which swallows a 404 for the same reason.
		if (error && !/not.?found/i.test(error.message)) {
			throw new Error(`Supabase Storage delete failed: ${error.message}`);
		}
	}
};

export * from './port';
