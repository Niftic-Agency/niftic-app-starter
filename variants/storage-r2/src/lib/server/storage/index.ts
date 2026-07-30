import { AwsClient } from 'aws4fetch';
import { env } from '$lib/server/env';
import type { StoragePort, UploadTarget } from './port';

/**
 * R2 implementation of the storage port.
 *
 * aws4fetch rather than @aws-sdk/client-s3: presigning is the only thing needed
 * here, and the SDK is two orders of magnitude larger for it.
 *
 * Two things about aws4fetch that are easy to get wrong, both verified against
 * its source:
 *
 * 1. There is no `expiresIn` option. `X-Amz-Expires` must already be on the URL
 *    when you sign, because it is part of the signed canonical query string.
 *    Setting it afterwards invalidates the signature.
 * 2. `signQuery` lives under the `aws` options object, not at the top level.
 *
 * The client must also send the URL back untouched — altering any query
 * parameter changes the signature and R2 answers 403.
 */

let client: AwsClient | undefined;

function r2(): { client: AwsClient; base: string; bucket: string } {
	const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env();

	client ??= new AwsClient({
		accessKeyId: R2_ACCESS_KEY_ID,
		secretAccessKey: R2_SECRET_ACCESS_KEY,
		service: 's3',
		// R2 is single-region; 'auto' is what Cloudflare documents.
		region: 'auto'
	});

	return {
		client,
		base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		bucket: R2_BUCKET
	};
}

function objectUrl(base: string, bucket: string, key: string): URL {
	// Encode each segment but keep the separators — the key is a path.
	const encoded = key.split('/').map(encodeURIComponent).join('/');
	return new URL(`${base}/${bucket}/${encoded}`);
}

export const storage: StoragePort = {
	async createUploadUrl({ key, contentType, maxBytes }): Promise<UploadTarget> {
		const { client, base, bucket } = r2();
		const url = objectUrl(base, bucket, key);

		// Short-lived: long enough for a slow connection, short enough that a
		// leaked URL is not a standing grant.
		url.searchParams.set('X-Amz-Expires', '900');

		const signed = await client.sign(new Request(url, { method: 'PUT' }), {
			aws: { signQuery: true }
		});

		return {
			url: signed.url,
			// The browser must send these verbatim; R2 rejects a mismatch. The
			// length header is what actually enforces the size cap at the edge —
			// our own check can only police what the client claims.
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(maxBytes)
			}
		};
	},

	async createDownloadUrl(key, opts): Promise<string> {
		const { client, base, bucket } = r2();
		const url = objectUrl(base, bucket, key);

		url.searchParams.set('X-Amz-Expires', String(opts?.expiresIn ?? 300));

		const signed = await client.sign(new Request(url, { method: 'GET' }), {
			aws: { signQuery: true }
		});

		return signed.url;
	},

	async delete(key): Promise<void> {
		const { client, base, bucket } = r2();
		const response = await client.fetch(objectUrl(base, bucket, key), { method: 'DELETE' });

		// R2 returns 404 for an object that was already gone. Deleting something
		// twice is not an error worth propagating.
		if (!response.ok && response.status !== 404) {
			throw new Error(`R2 delete failed with ${response.status}`);
		}
	}
};

export * from './port';
