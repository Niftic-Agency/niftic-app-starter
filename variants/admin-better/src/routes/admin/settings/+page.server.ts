import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireRole } from '$lib/server/auth/permissions';
import { audit } from '$lib/server/admin/audit';
import { listSettings, setSetting } from '$lib/server/db/repos/admin';
import type { Actions, PageServerLoad } from './$types';

const schema = z.object({
	key: z.string().min(1).max(100),
	// Values are JSON-encoded text, so the column type never has to change when a
	// setting stops being a string.
	value: z.string().max(2000)
});

export const load: PageServerLoad = async (event) => {
	requireRole(event, 'admin');
	return { settings: await listSettings() };
};

export const actions: Actions = {
	save: async (event) => {
		const actor = requireRole(event, 'admin');

		const parsed = schema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid setting.' });

		await setSetting(parsed.data.key, parsed.data.value);

		// The value is recorded because settings are small and operational —
		// unlike user data, knowing what it changed to is the point.
		await audit({
			actor,
			action: 'setting.changed',
			targetType: 'app_settings',
			targetId: parsed.data.key,
			detail: { value: parsed.data.value }
		});

		return { success: true };
	}
};
