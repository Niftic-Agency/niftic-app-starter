import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { isAllowedEmail } from './domains';

/**
 * `internal` mode — staff apps.
 *
 * Google only, restricted to `AUTH_ALLOWED_DOMAINS`. No email/password at all,
 * so there are no passwords to leak, no reset flow to phish, and offboarding
 * someone in Google Workspace offboards them here too.
 *
 * The mode file *is* the branch. Nothing downstream tests `authMode` at runtime
 * — configure ships exactly one of these two files as `mode.ts`.
 */
export function modeOptions() {
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();

	if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
		throw new Error(
			'internal auth mode requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. There is no password fallback by design.'
		);
	}

	return {
		emailAndPassword: { enabled: false },
		socialProviders: {
			google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET }
		},
		databaseHooks: {
			user: {
				create: {
					async before(user: { email: string }) {
						// Catches every path that can mint a user, OAuth included —
						// which a route-level check would not.
						if (!isAllowedEmail(user.email)) {
							logger.warn('auth.domain_rejected', { email: user.email });
							throw new Error('That email domain is not permitted to sign in.');
						}
						return { data: user };
					}
				}
			}
		}
	};
}

/**
 * Per-request enforcement. Removing a domain from the allowlist must lock out
 * people who already hold a session, not merely block new sign-ins.
 */
export function isSessionPermitted(email: string | null | undefined): boolean {
	return isAllowedEmail(email);
}

/** Sign-in page copy, so it matches the mode without branching in the markup. */
export const modeCopy = {
	title: 'Sign in',
	description: 'Use your work Google account.',
	showPasswordForm: false,
	showGoogle: true,
	showSignupLink: false
} as const;
