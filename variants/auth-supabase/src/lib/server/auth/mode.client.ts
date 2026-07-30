/**
 * `client` mode — apps real customers sign into.
 *
 * Email and password with a confirmed address, plus password reset, plus Google
 * if it is enabled in the dashboard. No domain restriction: anyone who confirms
 * an address may sign in.
 *
 * Note what is NOT here. Confirmation and reset mail is sent by Supabase Auth
 * rather than through `sendEmail()`, because Supabase owns the tokens. Point the
 * project's SMTP at Resend so those messages come from the same domain and with
 * the same deliverability as the rest — it is a one-time manual step, and it is
 * in the deploy doc.
 */
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
