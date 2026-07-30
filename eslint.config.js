import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

/**
 * Adapter-boundary rules. Each SDK may only be imported by the module that wraps
 * it, so swapping an implementation never means chasing imports across the app.
 * Variants that don't ship a given adapter simply never trip the rule.
 */
const restrictedSdkImports = [
	{ name: 'resend', message: 'Import `sendEmail` from $lib/server/email instead.' },
	{ name: 'aws4fetch', message: 'Use the storage port in $lib/server/storage instead.' },
	{
		name: '@supabase/supabase-js',
		message: 'Use the clients in $lib/supabase or $lib/server/supabase instead.'
	}
];

/**
 * The Supabase branch's escalation boundary.
 *
 * Everything under `$lib/server/admin/` bypasses row level security, which on
 * that branch means it bypasses authorization itself. Restricting the SDK is not
 * enough to contain that: the service-role client is a LOCAL module, so without
 * this any route could import it and skip every policy while still passing lint.
 *
 * So the direction is inverted from the SDK rules — instead of naming a package
 * nobody may import, this names a local module nobody outside its own directory
 * may hold. The privileged query goes in a module under `$lib/server/admin/` and
 * the route calls it by name; the client itself never leaves.
 */
const serviceClientConfined = [
	{
		group: ['$lib/server/admin/service-client', '**/server/admin/service-client'],
		message:
			'The service-role client bypasses RLS. Put the privileged query in a module under $lib/server/admin/ and call that by name instead.'
	}
];

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'no-restricted-imports': [
				'error',
				{ paths: restrictedSdkImports, patterns: serviceClientConfined }
			],
			// Env is read once, validated once. Everything else imports from there.
			'no-restricted-properties': [
				'error',
				{
					object: 'process',
					property: 'env',
					message: 'Import typed env from $lib/server/env instead of reading process.env.'
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		},
		rules: {
			// Our hrefs are data (the nav registry) or caller-supplied and may be
			// external (Button's `href` prop), so there is nothing static for
			// `resolve()` to check. Re-enable this if an app ever deploys under a
			// non-empty `paths.base`, where resolve() stops being cosmetic.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// The adapters themselves — the modules whose whole job is to wrap an SDK
		// so nothing else has to import it. They may reach for their SDK; they
		// still may not reach into the admin directory, so the rule is re-stated
		// with only the pattern half rather than switched off.
		files: [
			'src/lib/server/email/**',
			'src/lib/server/storage/**',
			'src/lib/supabase.ts',
			'src/lib/supabase-config.ts',
			// A directory on the Supabase branch, because the server client ships
			// alongside its health check.
			'src/lib/server/supabase/**'
		],
		rules: { 'no-restricted-imports': ['error', { patterns: serviceClientConfined }] }
	},
	{
		// The one directory that may hold the service-role client — and therefore
		// the one that may import it. Everything privileged lives here.
		files: ['src/lib/server/admin/**'],
		rules: { 'no-restricted-imports': 'off' }
	},
	{
		/**
		 * Tests talk to the SDK directly on purpose. A policy test that went
		 * through the app's own client would be testing the app; the point is to
		 * hold a publishable key the way an attacker would and watch the DATABASE
		 * refuse.
		 */
		files: ['tests/**'],
		rules: { 'no-restricted-imports': 'off' }
	},
	{
		files: ['src/lib/server/env.ts', 'scripts/**', 'tests/**', '*.config.ts', '*.config.js'],
		rules: { 'no-restricted-properties': 'off' }
	},
	{
		ignores: [
			// Everything tooling writes. This list must keep pace with
			// `.prettierignore` — it fell behind once, and the symptom was that
			// `pnpm build` followed by `pnpm lint` reported 912 errors in
			// adapter-vercel's own output. CI never saw it because CI lints before
			// it builds; a developer does the opposite.
			'.svelte-kit/',
			'build/',
			'.vercel/',
			'.data/',
			'coverage/',
			'test-results/',
			'playwright-report/',
			'node_modules/',
			'drizzle/',
			// Claude Code puts agent worktrees here. They are full copies of the
			// repo, tsconfig included, and typescript-eslint refuses to guess a
			// root when it can see two.
			'.claude/',
			// Overlay trees are type-checked after they are copied into a configured
			// app — that is the only context where their imports resolve.
			'variants/'
		]
	}
);
