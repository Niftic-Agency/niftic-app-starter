import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { auth } from './index';
import { isSessionPermitted } from './mode';

/**
 * Populates `locals.user` and `locals.session`.
 *
 * Better Auth's own `svelteKitHandler` does not do this — it only routes
 * `/api/auth/*`, which the catch-all endpoint already handles — so reading the
 * session onto locals is our job.
 *
 * This never redirects. Deciding what an anonymous request may see belongs to
 * the route (`(app)/+layout.server.ts` and each action), not to a global hook:
 * a hook that redirects would also redirect the API and the health endpoint.
 */
export const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	try {
		const result = await auth().api.getSession({ headers: event.request.headers });

		if (result?.user) {
			// Re-checked every request so that removing a domain from the
			// allowlist locks out existing sessions, not just new sign-ins.
			if (!isSessionPermitted(result.user.email)) {
				logger.warn('auth.session_domain_rejected', {
					requestId: event.locals.requestId,
					userId: result.user.id
				});
				return resolve(event);
			}

			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	} catch (error) {
		// A failed session lookup must not take the whole request down — it should
		// degrade to "signed out", and route guards take it from there.
		logger.error('auth.session_lookup_failed', { requestId: event.locals.requestId, error });
	}

	return resolve(event);
};
