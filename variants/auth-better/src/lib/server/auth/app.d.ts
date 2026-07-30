import type { AuthUser, AuthSession } from './index';

/**
 * Extends `App.Locals` by re-opening the namespace rather than replacing
 * `src/app.d.ts`. Interface declaration merging means several variants can each
 * add their own fields without any of them owning the file.
 */
declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
			session: AuthSession | null;
		}
	}
}

export {};
