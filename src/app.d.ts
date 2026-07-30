// Base ambient types.
//
// Variants EXTEND `App.Locals` by shipping their own `.d.ts` that re-opens this
// namespace (interface declaration merging) — e.g. `auth-better` adds `user` and
// `session`. Nothing overwrites this file, so the additions compose.

declare global {
	namespace App {
		interface Locals {
			requestId: string;
		}
		interface Error {
			code?: string;
			requestId?: string;
		}
	}
}

export {};
