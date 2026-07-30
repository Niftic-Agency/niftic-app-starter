import { redirect } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * Starts an OAuth sign-in. POST, so it cannot be triggered by a link or an
 * image tag on someone else's page.
 *
 * The provider list is closed on purpose. `provider` arrives in a query string,
 * and handing an attacker-chosen value to `signInWithOAuth` lets them pick which
 * identity provider your users are sent to.
 */
const PROVIDERS = new Set(['google']);

export const POST: RequestHandler = async (event) => {
	const provider = event.url.searchParams.get('provider') ?? '';
	if (!PROVIDERS.has(provider)) redirect(303, '/login?error=oauth');

	const { data, error } = await supabase(event).auth.signInWithOAuth({
		provider: provider as 'google',
		options: {
			redirectTo: `${event.url.origin}/auth/callback`,
			// The code comes back to our callback and is exchanged server-side, so
			// no token is ever handled by client JavaScript.
			skipBrowserRedirect: true
		}
	});

	if (error || !data?.url) {
		logger.warn('auth.oauth_start_failed', { requestId: event.locals.requestId, provider });
		redirect(303, '/login?error=oauth');
	}

	redirect(303, data.url);
};
