import { defineConfig, devices } from '@playwright/test';

/**
 * Two smokes, run against a real build.
 *
 * `preview` rather than `dev` on purpose: dev-mode SSR papers over adapter and
 * bundling problems that only appear in a production build, and those are
 * exactly the failures worth catching before a deploy.
 *
 * Chromium only. These assert that flows work, not that they render identically
 * everywhere — a browser matrix here would triple CI time for very little.
 */
const PORT = 4173;

export default defineConfig({
	testDir: 'tests',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? [['github'], ['list']] : [['list']],

	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},

	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

	webServer: {
		command: `pnpm build && pnpm preview --port ${PORT}`,
		port: PORT,
		reuseExistingServer: !process.env.CI,
		// A cold build plus start; generous because CI runners are slow.
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
