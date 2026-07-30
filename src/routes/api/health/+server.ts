import { json } from '@sveltejs/kit';
import { appConfig } from '$lib/app-config';
import { env } from '$lib/server/env';
import { runCheck } from '$lib/server/health';
import { checks } from '$lib/server/registry/health';
import type { RequestHandler } from './$types';

/**
 * GET /api/health
 *
 * Per-capability status plus an overall 200/503. Docker's HEALTHCHECK and any
 * uptime monitor point here, so it stays cheap and never mutates anything.
 *
 * Checks are contributed by variants through the health registry, so this file
 * needs no per-profile branching.
 */
export const GET: RequestHandler = async () => {
	const results = await Promise.all(
		checks.map(async (check) => [check.name, await runCheck(check)] as const)
	);

	const healthy = results.every(([, result]) => result.ok);

	return json(
		{
			status: healthy ? 'healthy' : 'degraded',
			profile: appConfig.profile,
			version: env().GIT_SHA ?? 'dev',
			checks: Object.fromEntries(results)
		},
		{
			status: healthy ? 200 : 503,
			headers: { 'cache-control': 'no-store' }
		}
	);
};

// Never prerender — this must reflect live state.
export const prerender = false;
