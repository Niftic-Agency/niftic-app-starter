import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * PROVISIONAL. `pnpm configure` rewrites this file with the adapter for the
 * chosen host — `@sveltejs/adapter-vercel` or `@sveltejs/adapter-node` — and
 * prunes whichever adapter package went unused.
 *
 * adapter-node is the provisional choice only because it needs no platform, so
 * the unconfigured superset can still `pnpm build`. That keeps the starter's own
 * CI honest: a base tree that no longer builds fails on the PR that broke it,
 * not later in the preset matrix.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
