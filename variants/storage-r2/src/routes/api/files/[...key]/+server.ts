import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { hasRole, requireUser } from '$lib/server/auth/permissions';
import { storage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * GET /api/files/[...key] — authorize, then redirect to a short-lived signed URL.
 *
 * The bucket is private and has no public URL, so this endpoint is the only way
 * to read an object. It answers 404 rather than 403 for someone else's file:
 * confirming that a key exists is information the caller has not earned.
 *
 * Authorization is checked against the database row, not against the shape of
 * the key — the key arrives from the client and proves nothing on its own.
 */
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const key = event.params.key;

	if (!key) error(404, 'Not found');

	const record = await db().query.uploads.findFirst({
		where: eq(schema.uploads.key, key)
	});

	if (!record) error(404, 'Not found');
	if (record.userId !== user.id && !hasRole(user, 'admin')) error(404, 'Not found');

	const url = await storage.createDownloadUrl(key, { expiresIn: 300 });

	// 302, not 301: the signed URL expires, and a cached permanent redirect
	// would send later requests to a dead link.
	redirect(302, url);
};
