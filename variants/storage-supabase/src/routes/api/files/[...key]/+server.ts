import { error, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/permissions';
import { storage } from '$lib/server/storage';
import { supabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * GET /api/files/[...key] — authorize, then redirect to a short-lived signed URL.
 *
 * The bucket is private and has no public URL, so this endpoint is the only way
 * to read an object. It answers 404 rather than 403 for someone else's file:
 * confirming that a key exists is information the caller has not earned.
 *
 * Note what does the authorizing. The lookup uses the USER-scoped client, so the
 * `uploads: owners select` policy already restricts it to the caller's own rows
 * — a row belonging to someone else simply is not visible, and the 404 falls out
 * of the policy rather than out of an `if`. That is the branch's whole argument
 * for RLS: the check cannot be forgotten because it is not written here.
 */
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const key = event.params.key;

	if (!key) error(404, 'Not found');

	const { data: record } = await supabase(event)
		.from('uploads')
		.select('key, user_id')
		.eq('key', key)
		.maybeSingle();

	// Missing and "hidden by a policy" are the same answer, which is the point.
	if (!record) error(404, 'Not found');

	// Belt as well as braces. The policy already made this impossible; asserting
	// it here means a future policy change that widened the read cannot silently
	// widen the download with it.
	if (record.user_id !== user.id) error(404, 'Not found');

	const url = await storage.createDownloadUrl(key, { expiresIn: 300 });

	// 302, not 301: the signed URL expires, and a cached permanent redirect would
	// send later requests to a dead link.
	redirect(302, url);
};
