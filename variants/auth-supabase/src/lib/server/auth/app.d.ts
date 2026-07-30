import type { AuthUser } from './permissions';

/**
 * Extends `App.Locals` by re-opening the namespace rather than replacing
 * `src/app.d.ts`. Interface declaration merging means several variants can each
 * add their own fields without any of them owning the file.
 *
 * There is no `session` here, unlike the Better Auth branch. The verified claims
 * are the session on this branch, and everything downstream needs is already in
 * `user` — anything else should be read from the database through the user's own
 * client, where a policy applies to it.
 */
declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
		}
	}
}

export {};
