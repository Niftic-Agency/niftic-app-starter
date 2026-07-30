import { APIError } from 'better-auth/api';
import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

const loginSchema = z.object({
	email: z.email('Enter a valid email address'),
	password: z.string().min(1, 'Enter your password')
});

/** Only ever redirect within this app — an open redirect is a phishing gift. */
function safeRedirect(target: string | null): string {
	if (!target || !target.startsWith('/') || target.startsWith('//')) return '/app';
	return target;
}

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(303, safeRedirect(event.url.searchParams.get('redirectTo')));
	return { form: await superValidate(zod4(loginSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth().api.signInEmail({
				body: { email: form.data.email.trim().toLowerCase(), password: form.data.password },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError) {
				logger.info('auth.signin_rejected', {
					requestId: event.locals.requestId,
					status: error.status
				});
				// Deliberately identical for "no such user" and "wrong password":
				// distinguishing them turns the form into an account enumerator.
				// Sent as a form message, not setError(form, ''), because the page
				// renders $message — a form-level error would never be displayed.
				return message(form, 'That email or password is not right.', { status: 400 });
			}
			throw error;
		}

		redirect(303, safeRedirect(event.url.searchParams.get('redirectTo')));
	}
};
