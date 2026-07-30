import { ulid } from 'ulid';
import { db, schema } from '$lib/server/db';
import { logger } from '$lib/server/logger';

/**
 * Record a privileged action. Every admin mutation calls this.
 *
 * Writes to the database AND to the log stream: the table is what an operator
 * reads in /admin, the log line is what survives if the database is the thing
 * that went wrong.
 *
 * Never throws. An audit write failing must not roll back the action it
 * describes — losing the record is bad, but leaving the system in a state where
 * the admin thinks the change failed is worse. Failures are logged loudly.
 */
export interface AuditInput {
	actor: { id: string; email: string };
	action: string;
	targetType?: string;
	targetId?: string;
	detail?: Record<string, unknown>;
}

export async function audit(input: AuditInput): Promise<void> {
	const entry = {
		id: ulid(),
		actorId: input.actor.id,
		actorEmail: input.actor.email,
		action: input.action,
		targetType: input.targetType ?? null,
		targetId: input.targetId ?? null,
		detail: input.detail ? JSON.stringify(input.detail) : null
	};

	logger.info('audit', {
		action: entry.action,
		actorId: entry.actorId,
		targetId: entry.targetId
	});

	try {
		await db().insert(schema.auditLog).values(entry);
	} catch (error) {
		logger.error('audit.write_failed', { action: entry.action, error });
	}
}
