import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// `tailwindcss()` must come before `sveltekit()`.
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.ts'],
		environment: 'node',
		// A freshly configured app carries no tests of its own until its feature
		// variants ship them, and the engine's own suite is pruned along with the
		// engine. Exiting non-zero on "no tests found" would make the generated
		// app's very first CI run red for no defect.
		passWithNoTests: true
	}
});
