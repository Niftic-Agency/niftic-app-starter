import { sequence } from '@sveltejs/kit/hooks';
import type { HandleServerError } from '@sveltejs/kit';
import { handles } from '$lib/server/registry/hooks';
import { logger } from '$lib/server/logger';

/**
 * The hook sequence is assembled by `pnpm configure` into
 * `$lib/server/registry/hooks` — see the note in that file. Add cross-cutting
 * behaviour by contributing to the registry, not by editing this file.
 */
export const handle = sequence(...handles);

/**
 * Users get a request id they can quote; the details go to the log only.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const requestId = event.locals.requestId ?? 'unknown';

	// 404s and other expected client errors aren't worth an error-level line.
	if (status < 500) {
		return { message, requestId };
	}

	logger.error('unhandled', {
		requestId,
		path: event.url.pathname,
		method: event.request.method,
		error
	});

	return {
		message: 'Something went wrong on our end.',
		requestId
	};
};
