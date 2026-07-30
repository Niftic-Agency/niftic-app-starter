import { env } from '$env/dynamic/public';

/**
 * The two public Supabase values, read once and in one place.
 *
 * `$env/dynamic/public` rather than `static`, for the same reason the server env
 * module uses the dynamic form: a static read inlines at build time and fails
 * the build when the value is absent, so CI could never build without a real
 * project. These are public by design — the publishable key is meant to ship in
 * a browser bundle — so there is nothing here to leak.
 *
 * Naming: `PUBLISHABLE`, not `ANON`. Supabase replaced the legacy `anon` and
 * `service_role` JWTs with `sb_publishable_…` and `sb_secret_…` keys; the legacy
 * pair still works but is being retired. New projects get the new names, so the
 * template uses them.
 */
export const publicEnv = {
	url: env.PUBLIC_SUPABASE_URL ?? '',
	publishableKey: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
};

/**
 * Thrown at the first real use rather than at module scope — the same lazy rule
 * the server env module follows, and for the same reason: a top-level throw runs
 * during `vite build` and prerendering, where no project needs to exist yet.
 */
export function requirePublicEnv(): { url: string; publishableKey: string } {
	if (!publicEnv.url || !publicEnv.publishableKey) {
		throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set.');
	}
	return publicEnv as { url: string; publishableKey: string };
}
