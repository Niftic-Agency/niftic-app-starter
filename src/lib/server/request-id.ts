import type { Handle } from '@sveltejs/kit';
import { logger } from './logger';

/**
 * Assigns a request id and logs request start/end.
 *
 * Always first in the hook sequence — everything downstream logs against the id
 * it sets. Honours an inbound `x-request-id` so a trace survives a proxy hop,
 * and echoes it back on the response.
 */
export const handleRequestId: Handle = async ({ event, resolve }) => {
	const inbound = event.request.headers.get('x-request-id');
	const requestId = inbound && inbound.length <= 200 ? inbound : crypto.randomUUID();
	event.locals.requestId = requestId;

	const log = logger.child({ requestId });
	const started = performance.now();
	const { method } = event.request;
	const path = event.url.pathname;

	log.info('request.start', { method, path });

	try {
		const response = await resolve(event);
		response.headers.set('x-request-id', requestId);
		log.info('request.end', {
			method,
			path,
			status: response.status,
			ms: Math.round(performance.now() - started)
		});
		return response;
	} catch (error) {
		log.error('request.failed', {
			method,
			path,
			ms: Math.round(performance.now() - started),
			error
		});
		throw error;
	}
};
