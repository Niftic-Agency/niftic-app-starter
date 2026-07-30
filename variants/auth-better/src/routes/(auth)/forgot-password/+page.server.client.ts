import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

const schema = z.object({ email: z.email('Enter a valid email address') });

const CONFIRMATION = 'If that address has an account, a reset link is on its way.';

export const load: PageServerLoad = async () => ({ form: await superValidate(zod4(schema)) });

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(schema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth().api.requestPasswordReset({
				body: {
					email: form.data.email.trim().toLowerCase(),
					redirectTo: '/reset-password'
				},
				headers: event.request.headers
			});
		} catch (error) {
			// Swallowed on purpose. The response must not vary with whether the
			// address exists, or this endpoint becomes an account oracle.
			logger.info('auth.reset_request_failed', { requestId: event.locals.requestId, error });
		}

		return message(form, CONFIRMATION);
	}
};
