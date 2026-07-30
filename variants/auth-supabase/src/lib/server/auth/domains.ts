import { env } from '$lib/server/env';

/**
 * Email-domain allowlist for `internal` apps.
 *
 * Supabase Auth owns account creation, so unlike the Better Auth branch there
 * is no hook to reject a sign-up in. Enforcement is therefore in the session
 * check, on every request — which is the stronger of the two placements anyway:
 * removing a domain from the list locks out sessions that already exist, not
 * just new sign-ins.
 *
 * A user who signs up with a disallowed address will exist in `auth.users` and
 * simply never hold a usable session. Prune them with the service-role client if
 * that matters to you.
 *
 * Character-for-character the same logic as the Better Auth branch's copy. The
 * two auth variants are mutually exclusive so there is no collision, and the
 * rules below are subtle enough that sharing a base module would be worth it if
 * a third auth branch ever appeared.
 */

export function parseDomains(raw: string | undefined | null): string[] {
	return (raw ?? '')
		.split(',')
		.map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
		.filter(Boolean);
}

/**
 * Pure so it can be tested without SvelteKit's env. Every rejection rule here
 * exists because the obvious alternative is unsafe:
 *
 * - An empty allowlist denies everything. Treating "unset" as "allow all" would
 *   turn a missing env var into an open door.
 * - Comparison is exact, never a suffix. `endsWith('niftic.agency')` would also
 *   accept `evil-niftic.agency`.
 * - Only the part after the LAST `@` counts, since `a@b@c.com` is a valid
 *   address whose domain is `c.com`.
 */
export function matchesDomain(email: string | null | undefined, domains: string[]): boolean {
	if (domains.length === 0) return false;
	if (!email) return false;

	const at = email.lastIndexOf('@');
	if (at === -1) return false;

	const domain = email
		.slice(at + 1)
		.toLowerCase()
		.trim();
	if (!domain) return false;

	return domains.includes(domain);
}

export function allowedDomains(): string[] {
	return parseDomains(env().AUTH_ALLOWED_DOMAINS);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
	return matchesDomain(email, allowedDomains());
}
