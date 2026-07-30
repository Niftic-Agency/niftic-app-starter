import { env } from '$lib/server/env';

/**
 * Email-domain allowlist for `internal` apps.
 *
 * Enforced in two places on purpose: once when Better Auth is about to create a
 * user (which covers every sign-in path, including OAuth), and again on each
 * request. The second check matters because removing a domain from the list
 * should lock out anyone who already has a session, not just block new ones.
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
