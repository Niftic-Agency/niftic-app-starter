import { toSvelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/**
 * Better Auth owns everything under /api/auth — sign-in, sign-up, OAuth
 * callbacks, verification, reset. Don't add routes inside this namespace.
 */
const handler: RequestHandler = (event) => toSvelteKitHandler(auth())(event);

export const GET = handler;
export const POST = handler;
