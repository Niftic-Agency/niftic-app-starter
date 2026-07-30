import { createBrowserClient } from '@supabase/ssr';
import { requirePublicEnv } from '$lib/supabase-config';
import type { Database } from '$lib/database.types';

/**
 * The browser client.
 *
 * Safe to import from a component: it holds the PUBLISHABLE key, which is meant
 * to be public, and every query it makes is subject to row level security. That
 * is what makes client-side reads and Realtime subscriptions legitimate on this
 * branch and not on the Drizzle ones — there, the database has no opinion about
 * who is asking.
 *
 * It shares cookie storage with the server client, so a session established by
 * a form action is visible here without a round trip.
 */
let instance: ReturnType<typeof create> | undefined;

function create() {
	const { url, publishableKey } = requirePublicEnv();
	return createBrowserClient<Database>(url, publishableKey);
}

export function supabaseBrowser(): ReturnType<typeof create> {
	instance ??= create();
	return instance;
}
