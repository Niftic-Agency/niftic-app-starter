import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { publicEnv } from '$lib/supabase-config';
import type { Database } from '$lib/database.types';

/**
 * The USER-SCOPED server client. This is the one application code uses.
 *
 * It carries the caller's own access token, so every query it makes is subject
 * to row level security exactly as a query from the browser would be. That is
 * deliberate and it is the whole security model of this branch: RLS is the
 * authorization layer, and server code that bypassed it would be a second,
 * unreviewed one.
 *
 * The service-role client lives in `$lib/server/admin/` and ESLint refuses to
 * let anything else import it.
 */
export function supabase(event: RequestEvent) {
	return createServerClient<Database>(publicEnv.url, publicEnv.publishableKey, {
		cookies: {
			getAll: () => event.cookies.getAll(),

			/**
			 * `setAll` takes a SECOND argument, and dropping it is a real
			 * vulnerability rather than an untidiness: the library passes
			 * `Cache-Control: private, no-store`, `Expires: 0` and `Pragma: no-cache`,
			 * and a response that sets an auth cookie without them can be cached by
			 * a CDN and then served — session token and all — to a different person.
			 */
			setAll: (cookiesToSet, headers) => {
				for (const { name, value, options } of cookiesToSet) {
					// `path: '/'` because SvelteKit requires an explicit path and the
					// session must be readable by every route.
					event.cookies.set(name, value, { ...options, path: options?.path ?? '/' });
				}
				for (const [key, headerValue] of Object.entries(headers)) {
					event.setHeaders({ [key]: headerValue });
				}
			}
		}
	});
}

/**
 * Whether a secret key is configured at all.
 *
 * Read through `env()` so the ban on `process.env` outside that module holds
 * here too, and exported so the health check can report configuration without
 * the admin module having to be imported from outside `$lib/server/admin/`.
 */
export function hasSecretKey(): boolean {
	return Boolean(env().SUPABASE_SECRET_KEY);
}

/**
 * Re-exported so routes get the SDK's types from the wrapper rather than
 * importing the SDK — which ESLint forbids, and rightly: "it's only a type"
 * is how a value import eventually sneaks in beside it.
 */
export type { EmailOtpType } from '@supabase/supabase-js';
