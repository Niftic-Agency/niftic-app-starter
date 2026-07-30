import { error, json } from '@sveltejs/kit';
import { ulid } from 'ulid';
import { z } from 'zod';
import { db, schema } from '$lib/server/db';
import { requireUser } from '$lib/server/auth/permissions';
import { logger } from '$lib/server/logger';
import { storage, uploadKey, validateUpload } from '$lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * POST /api/uploads — issue a short-lived signed PUT URL.
 *
 * The browser uploads directly to the bucket; bytes never pass through the app.
 * The key is derived server-side from the authenticated user, never taken from
 * the request, so a caller cannot choose where their file lands.
 */

const requestSchema = z.object({
	filename: z.string().min(1).max(255),
	contentType: z.string().min(1).max(255),
	size: z.number().int().positive()
});

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);

	const body = await event.request.json().catch(() => null);
	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) error(400, 'Invalid upload request.');

	const check = validateUpload({
		contentType: parsed.data.contentType,
		size: parsed.data.size
	});
	if (!check.ok) error(400, check.error ?? 'That file cannot be uploaded.');

	const id = ulid();
	const key = uploadKey(user.id, id, parsed.data.filename);

	const target = await storage.createUploadUrl({
		key,
		contentType: parsed.data.contentType,
		maxBytes: parsed.data.size
	});

	// Recorded before the upload so an interrupted transfer leaves a row we can
	// reconcile, rather than an object nobody knows about.
	await db().insert(schema.uploads).values({
		id,
		key,
		userId: user.id,
		filename: parsed.data.filename,
		contentType: parsed.data.contentType,
		size: parsed.data.size
	});

	logger.info('upload.issued', { requestId: event.locals.requestId, userId: user.id, key });

	return json({ id, key, upload: target });
};
