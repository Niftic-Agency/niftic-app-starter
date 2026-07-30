import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { appConfig } from '$lib/app-config';
import { db, schema } from '$lib/server/db';
import { env } from '$lib/server/env';
import { modeOptions } from './mode';
import { orgAdapterSchema, orgPlugins } from './plugins';
import { drizzleProvider } from './provider';

/**
 * The Better Auth instance.
 *
 * Built lazily for the same reason `env()` validates lazily: constructing it at
 * module scope would read env during SSR module initialisation, i.e. during
 * `vite build`, and fail every build that doesn't have real secrets.
 */
function create() {
	const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = env();

	return betterAuth({
		appName: appConfig.title,
		secret: BETTER_AUTH_SECRET,
		baseURL: BETTER_AUTH_URL,

		database: drizzleAdapter(db(), {
			provider: drizzleProvider,
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification,
				...orgAdapterSchema
			}
		}),

		// Sessions sit behind a proxy on both hosts, so the cookie has to be
		// declared secure explicitly and the origin has to be trusted explicitly.
		trustedOrigins: [BETTER_AUTH_URL],
		advanced: {
			useSecureCookies: BETTER_AUTH_URL.startsWith('https://')
		},

		session: {
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24,
			cookieCache: { enabled: true, maxAge: 60 * 5 }
		},

		// This array MUST stay a literal. Better Auth reads the tuple to build
		// `auth.api` and the session type; widening it to BetterAuthPlugin[] takes
		// `setRole`, `banUser` and `user.role` with it. `orgPlugins` is a tuple for
		// the same reason — see ./plugins.orgs.ts.
		plugins: [
			// Powers /admin: list users, change role, ban.
			admin({ defaultRole: 'user', adminRoles: ['admin'] }),
			// Empty unless the app was configured with organizations.
			...orgPlugins,
			// Must be last — it writes Set-Cookie for cookies produced inside
			// SvelteKit form actions, which otherwise get dropped.
			sveltekitCookies(getRequestEvent)
		],

		...modeOptions()
	});
}

let instance: ReturnType<typeof create> | undefined;

export function auth(): ReturnType<typeof create> {
	instance ??= create();
	return instance;
}

export type Auth = ReturnType<typeof create>;
export type AuthUser = Auth['$Infer']['Session']['user'];
export type AuthSession = Auth['$Infer']['Session']['session'];
