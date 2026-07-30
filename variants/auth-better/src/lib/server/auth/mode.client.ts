import { env } from '$lib/server/env';
import { sendEmail } from '$lib/server/email';

/**
 * `client` mode — apps real customers sign into.
 *
 * Email and password with required verification, plus password reset. Google is
 * offered only when credentials are configured, so a client app can start
 * without it and add it later without a code change.
 *
 * Verification and reset mail go through sendEmail(), so they share the same
 * pipeline — and the same EMAIL_DRY_RUN switch — as everything else.
 */
export function modeOptions() {
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();

	return {
		emailAndPassword: {
			enabled: true,
			// A verified address is what makes password reset trustworthy.
			requireEmailVerification: true,
			minPasswordLength: 12,
			sendResetPassword: async ({
				user,
				url
			}: {
				user: { email: string; name?: string };
				url: string;
			}) => {
				await sendEmail({
					to: user.email,
					template: 'resetPassword',
					data: { url, name: user.name }
				});
			}
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({
				user,
				url
			}: {
				user: { email: string; name?: string };
				url: string;
			}) => {
				await sendEmail({
					to: user.email,
					template: 'verifyEmail',
					data: { url, name: user.name }
				});
			}
		},
		...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
			? {
					socialProviders: {
						google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET }
					}
				}
			: {})
	};
}

/** No domain restriction in client mode — anyone who verifies may sign in. */
export function isSessionPermitted(_email: string | null | undefined): boolean {
	return true;
}

export const modeCopy = {
	title: 'Sign in',
	description: 'Welcome back.',
	showPasswordForm: true,
	showGoogle: true,
	showSignupLink: true
} as const;
