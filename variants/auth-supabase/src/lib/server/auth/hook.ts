import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
// From `./mode`, which configure resolves from mode.internal.ts or
// mode.client.ts — the domain allowlist only applies on the internal branch.
import { isSessionPermitted } from './mode';

/**
 * Populates `locals.user`.
 *
 * The one rule that matters on this branch: **never trust `getSession()`**.
 * It reads the access token out of a cookie and decodes it without verifying
 * anything, so a forged cookie produces a forged user. Supabase's own types say
 * so in as many words.
 *
 * `getClaims()` is the answer, and it is better than the `getUser()` the older
 * docs recommend. It verifies the JWT signature against the project's JWKS —
 * locally, using WebCrypto, for projects on asymmetric signing keys, and the
 * key set is cached. `getUser()` makes a network round trip to the auth server
 * on every single request instead. Same guarantee, far less latency.
 *
 * (If a project is still on a symmetric secret, `getClaims()` falls back to
 * asking the server, so it is never weaker than `getUser()` — only sometimes
 * faster.)
 */
export const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	try {
		const client = supabase(event);
		const { data, error } = await client.auth.getClaims();

		if (error || !data?.claims?.sub) return resolve(event);

		const claims = data.claims;
		const email = typeof claims.email === 'string' ? claims.email : '';

		// Re-checked on every request, not just at sign-in, so removing a domain
		// from the allowlist locks out sessions that already exist. `internal`
		// mode's enforcement lives here rather than in a login route because a
		// session outlives the route that created it.
		if (!isSessionPermitted(email)) {
			logger.warn('auth.session_domain_rejected', {
				requestId: event.locals.requestId,
				userId: claims.sub
			});
			// Clear the cookies as well as refusing the request — otherwise the
			// browser keeps presenting a session the server will never accept, and
			// the user sees a redirect loop rather than a sign-in page.
			await client.auth.signOut();
			return resolve(event);
		}

		event.locals.user = {
			id: claims.sub,
			email,
			// Present when the sign-up flow collected it; absent otherwise. The
			// role does NOT come from here — it lives in `profiles`, because a
			// claim is whatever the token says and a role must not be.
			displayName:
				typeof claims.user_metadata === 'object' &&
				claims.user_metadata &&
				'display_name' in claims.user_metadata &&
				typeof claims.user_metadata.display_name === 'string'
					? claims.user_metadata.display_name
					: null
		};
	} catch (error) {
		// A failed verification must not take the request down — it should degrade
		// to "signed out" and let the route guards do their job.
		logger.error('auth.session_lookup_failed', { requestId: event.locals.requestId, error });
	}

	return resolve(event);
};
