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
			'no-restricted-imports': ['error', { paths: restrictedSdkImports }],
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
		// The adapters themselves, plus the one module allowed to read process.env.
		files: [
			'src/lib/server/email/**',
			'src/lib/server/storage/**',
			'src/lib/supabase.ts',
			'src/lib/server/supabase.ts',
			'src/lib/server/admin/**'
		],
		rules: { 'no-restricted-imports': 'off' }
	},
	{
		files: ['src/lib/server/env.ts', 'scripts/**', 'tests/**', '*.config.ts', '*.config.js'],
		rules: { 'no-restricted-properties': 'off' }
	},
	{
		ignores: [
			'.svelte-kit/',
			'build/',
			'node_modules/',
			'drizzle/',
			// Overlay trees are type-checked after they are copied into a configured
			// app — that is the only context where their imports resolve.
			'variants/'
		]
	}
);
