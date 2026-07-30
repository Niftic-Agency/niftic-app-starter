import { Resend } from 'resend';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { templates, type TemplateData, type TemplateName } from './templates';

/**
 * The one way to send email.
 *
 * `resend` may not be imported anywhere else — ESLint enforces it — so swapping
 * providers is a change to this file rather than a hunt across the codebase.
 *
 * `EMAIL_DRY_RUN` logs the payload instead of sending. It defaults to ON outside
 * production, so a fresh checkout can exercise sign-up and password reset
 * without an API key and without mailing anyone real.
 */

export interface SendEmailOptions<T extends TemplateName> {
	to: string | string[];
	template: T;
	data: TemplateData<T>;
	/** Overrides the template's own subject. */
	subject?: string;
	replyTo?: string;
}

export interface SendEmailResult {
	ok: boolean;
	id?: string;
	dryRun: boolean;
}

let client: Resend | undefined;

function isDryRun(): boolean {
	const value = env().EMAIL_DRY_RUN;
	if (value !== undefined) return value !== 'false';
	// No explicit setting: send only in production.
	return globalThis.process?.env?.NODE_ENV !== 'production';
}

export async function sendEmail<T extends TemplateName>(
	options: SendEmailOptions<T>
): Promise<SendEmailResult> {
	const { to, template, data, subject, replyTo } = options;
	const { EMAIL_FROM, EMAIL_REPLY_TO, RESEND_API_KEY } = env();

	const rendered = templates[template](data as never);
	const recipients = Array.isArray(to) ? to : [to];

	if (isDryRun()) {
		// Recipients and subject only — never the body, which routinely contains a
		// one-time token that would then live in the log.
		logger.info('email.dry_run', {
			template,
			to: recipients,
			subject: subject ?? rendered.subject
		});
		return { ok: true, dryRun: true };
	}

	// The generated env schema marks these required when email is enabled, but
	// the superset's provisional schema cannot — so assert here. Reaching this
	// with either unset means a real deployment is misconfigured, and failing
	// loudly beats silently dropping mail.
	if (!RESEND_API_KEY || !EMAIL_FROM) {
		throw new Error(
			'Email is enabled but RESEND_API_KEY and/or EMAIL_FROM are unset. Set them, or set EMAIL_DRY_RUN=true.'
		);
	}

	client ??= new Resend(RESEND_API_KEY);

	const { data: result, error } = await client.emails.send({
		from: EMAIL_FROM,
		to: recipients,
		subject: subject ?? rendered.subject,
		html: rendered.html,
		text: rendered.text,
		...((replyTo ?? EMAIL_REPLY_TO) ? { replyTo: replyTo ?? EMAIL_REPLY_TO } : {})
	});

	if (error) {
		logger.error('email.failed', { template, to: recipients, error: error.message });
		// Callers decide whether a failed send should fail the request. Sign-up
		// usually should not; an invitation usually should.
		return { ok: false, dryRun: false };
	}

	logger.info('email.sent', { template, to: recipients, id: result?.id });
	return { ok: true, id: result?.id, dryRun: false };
}

export { templates };
