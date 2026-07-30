import { redirect } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * Where an OAuth provider sends the browser back to. The PKCE code is exchanged
 * for a session here, server-side, so the tokens are written straight into
 * cookies and never touch client JavaScript.
 */
export const GET: RequestHandler = async (event) => {
	const code = event.url.searchParams.get('code');
	const next = event.url.searchParams.get('next');
	const target = next && /^\/(?!\/)/.test(next) ? next : '/app';

	if (!code) redirect(303, '/login?error=oauth');

	const { error } = await supabase(event).auth.exchangeCodeForSession(code);

	if (error) {
		logger.warn('auth.oauth_exchange_failed', { requestId: event.locals.requestId });
		redirect(303, '/login?error=oauth');
	}

	redirect(303, target);
};
