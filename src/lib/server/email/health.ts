import { env } from '$lib/server/env';
import type { HealthCheck } from '$lib/server/health';

/**
 * Configuration presence only — this never sends.
 *
 * `/api/health` is polled by uptime monitors; a check that actually delivered
 * mail would burn quota and spam someone. All we can honestly assert here is
 * that the app has what it needs to send when asked.
 */
export const emailCheck: HealthCheck = {
	name: 'email',
	async run() {
		const { RESEND_API_KEY, EMAIL_FROM, EMAIL_DRY_RUN } = env();

		if (EMAIL_DRY_RUN !== undefined && EMAIL_DRY_RUN !== 'false') {
			return { note: 'dry run — payloads are logged, not sent' };
		}
		if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
		if (!EMAIL_FROM) throw new Error('EMAIL_FROM is not set');

		return { note: 'configured' };
	}
};
