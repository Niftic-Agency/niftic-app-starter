import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/permissions';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
import { storage, uploadKey, validateUpload } from '$lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * POST /api/uploads — issue a short-lived signed PUT URL.
 *
 * Identical in shape to the R2 branch: the browser uploads directly to the
 * bucket, bytes never pass through the app, and the key is derived server-side
 * from the authenticated user rather than taken from the request.
 *
 * The ledger row is written with the USER-scoped client, so the insert is
 * checked by the `uploads: owners insert` policy — the same policy that would
 * refuse it if this code ever got the user id wrong.
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

	// Postgres generates the id, and the key needs it, so ask for one first.
	const id = crypto.randomUUID();
	const key = uploadKey(user.id, id, parsed.data.filename);

	const target = await storage.createUploadUrl({
		key,
		contentType: parsed.data.contentType,
		maxBytes: parsed.data.size
	});

	// Recorded before the upload so an interrupted transfer leaves a row we can
	// reconcile, rather than an object nobody knows about.
	const { error: insertError } = await supabase(event).from('uploads').insert({
		id,
		key,
		user_id: user.id,
		filename: parsed.data.filename,
		content_type: parsed.data.contentType,
		size: parsed.data.size
	});

	if (insertError) {
		logger.error('upload.record_failed', { requestId: event.locals.requestId, key });
		error(500, 'Could not start that upload.');
	}

	logger.info('upload.issued', { requestId: event.locals.requestId, userId: user.id, key });

	return json({ id, key, upload: target });
};
