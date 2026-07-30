import { isAllowedEmail } from './domains';

/**
 * `internal` mode — apps only your own people sign into.
 *
 * Sign-in is Google-only in practice (turn the email provider off in the
 * Supabase dashboard), and the allowlist is what actually enforces it: a session
 * whose address is not on it is signed out on the request that discovers it.
 */
export function isSessionPermitted(email: string | null | undefined): boolean {
	return isAllowedEmail(email);
}

export const modeCopy = {
	title: 'Sign in',
	description: 'Use your work account.',
	showPasswordForm: false,
	showGoogle: true,
	showSignupLink: false
} as const;
