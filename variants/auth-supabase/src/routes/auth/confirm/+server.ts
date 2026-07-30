import { redirect } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { supabase, type EmailOtpType } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * The token-hash route every Supabase email link points at: confirm an address,
 * accept an invite, finish a password reset.
 *
 * A GET that mutates, which is unusual and is the platform's design rather than
 * ours — the link in the email is the credential. `verifyOtp` exchanges it for a
 * session exactly once, so a link that has already been used fails.
 *
 * `next` is a path, and it is validated as one. Redirecting to whatever the
 * query string says is an open redirect: a link that looks like it belongs to
 * this app and lands on someone else's.
 */
function safeNext(raw: string | null): string {
	if (!raw) return '/app';
	// A single leading slash and no scheme — "//evil.example" is a protocol-
	// relative URL and would leave the site.
	return /^\/(?!\/)/.test(raw) ? raw : '/app';
}

export const GET: RequestHandler = async (event) => {
	const tokenHash = event.url.searchParams.get('token_hash');
	const type = event.url.searchParams.get('type') as EmailOtpType | null;
	const next = safeNext(event.url.searchParams.get('next'));

	if (!tokenHash || !type) redirect(303, '/login?error=link');

	const { error } = await supabase(event).auth.verifyOtp({ type, token_hash: tokenHash });

	if (error) {
		logger.warn('auth.verify_failed', { requestId: event.locals.requestId, type });
		redirect(303, '/login?error=link');
	}

	redirect(303, next);
};
