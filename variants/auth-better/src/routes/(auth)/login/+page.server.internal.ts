import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `internal` mode has no password form — sign-in happens entirely through
 * Google, so there is no action here, only the redirect-if-already-signed-in
 * check and the reason to show if the domain guard turned someone away.
 */
export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(303, '/app');

	return {
		// Set by the OAuth callback when the allowlist rejected the account.
		domainRejected: event.url.searchParams.get('error') === 'domain'
	};
};
