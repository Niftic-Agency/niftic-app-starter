import { createAuthClient } from 'better-auth/svelte';
import { adminClient } from 'better-auth/client/plugins';

/**
 * Browser-side auth client.
 *
 * Safe to import from components: it only ever talks to `/api/auth/*` on this
 * origin and holds no secret. Anything it can do, the server re-authorizes.
 */
export const authClient = createAuthClient({
	plugins: [adminClient()]
});

export const { signIn, signUp, signOut, useSession } = authClient;
