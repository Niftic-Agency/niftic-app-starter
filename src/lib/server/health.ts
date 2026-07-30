/**
 * Health check contract.
 *
 * Each capability contributes one check via its variant's `registries.health`
 * declaration; `pnpm configure` assembles them into `registry/health.ts`.
 *
 * A check either resolves (healthy, optionally with a note) or throws. Checks
 * must be cheap and must never mutate: `/api/health` is hit by Docker's
 * HEALTHCHECK and by uptime monitors, potentially every few seconds.
 */
export interface HealthCheck {
	name: string;
	run(): Promise<{ note?: string } | void>;
}

export interface HealthCheckResult {
	ok: boolean;
	ms?: number;
	note?: string;
	error?: string;
}

export async function runCheck(check: HealthCheck): Promise<HealthCheckResult> {
	const started = performance.now();
	try {
		const result = await check.run();
		return {
			ok: true,
			ms: Math.round(performance.now() - started),
			...(result?.note ? { note: result.note } : {})
		};
	} catch (error) {
		return {
			ok: false,
			ms: Math.round(performance.now() - started),
			// Never leak an internal message to an unauthenticated endpoint.
			error: error instanceof Error ? error.name : 'unknown'
		};
	}
}
