import { supabaseAdmin } from './service-client';
import { logger } from '$lib/server/logger';

/**
 * Record an admin action.
 *
 * Through the service-role client, because `audit_log` has no policies at all —
 * a log the actor could write is a log the actor could forge.
 *
 * Never throws. A failure to audit should be loud in the logs but must not undo
 * the action that was already taken; the alternative is a half-applied change
 * whose only trace is the failure you just swallowed.
 */
export async function audit(entry: {
	actor: { id: string; email: string };
	action: string;
	targetType?: string;
	targetId?: string;
	detail?: Record<string, unknown>;
}): Promise<void> {
	const { error } = await supabaseAdmin()
		.from('audit_log')
		.insert({
			actor_id: entry.actor.id,
			actor_email: entry.actor.email,
			action: entry.action,
			target_type: entry.targetType ?? null,
			target_id: entry.targetId ?? null,
			detail: (entry.detail ?? null) as never
		});

	if (error) logger.error('audit.write_failed', { action: entry.action, error: error.message });
}

export interface AuditEntry {
	id: string;
	actor_email: string | null;
	action: string;
	target_type: string | null;
	target_id: string | null;
	created_at: string;
}

/**
 * The most recent entries, newest first. Read through the service-role client
 * for the same reason they are written through it: `audit_log` has no policies,
 * so there is no user-scoped way to see it.
 */
export async function recentAuditEntries(limit = 100): Promise<AuditEntry[]> {
	const { data } = await supabaseAdmin()
		.from('audit_log')
		.select('id, actor_email, action, target_type, target_id, created_at')
		.order('created_at', { ascending: false })
		.limit(limit);

	return data ?? [];
}
