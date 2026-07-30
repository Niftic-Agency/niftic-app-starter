import { appConfig } from '$lib/app-config';

/**
 * Email templates.
 *
 * Plain functions returning `{ subject, html, text }` — no template engine, no
 * MJML, no React. Every message ships a text part: some clients render it, and
 * spam filters weigh its absence.
 *
 * Interpolated values are escaped, because a display name is user input and an
 * email is a place it gets rendered.
 */

export interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Shared chrome. Inline styles only — email clients strip <style> blocks. */
function layout(heading: string, body: string, action?: { label: string; url: string }): string {
	const button = action
		? `<p style="margin:32px 0;">
				<a href="${escapeHtml(action.url)}" style="background:#151515;color:#f4f2ee;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:500;">${escapeHtml(action.label)}</a>
			</p>
			<p style="color:#8c8b87;font-size:13px;line-height:1.5;">If the button doesn't work, paste this into your browser:<br><span style="color:#5a5a58;word-break:break-all;">${escapeHtml(action.url)}</span></p>`
		: '';

	return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#151515;">
	<div style="max-width:520px;margin:0 auto;background:#fcfaf6;border:1px solid rgba(21,21,21,0.08);border-radius:12px;padding:32px;">
		<h1 style="margin:0 0 16px;font-size:20px;font-weight:500;">${escapeHtml(heading)}</h1>
		${body}
		${button}
		<p style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(21,21,21,0.08);color:#8c8b87;font-size:12px;">${escapeHtml(appConfig.title)}</p>
	</div>
</body></html>`;
}

export const templates = {
	verifyEmail(data: { url: string; name?: string }): RenderedEmail {
		const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
		return {
			subject: `Confirm your email for ${appConfig.title}`,
			html: layout(
				'Confirm your email',
				`<p style="line-height:1.6;">${escapeHtml(greeting)} confirm this address to finish setting up your account.</p>`,
				{ label: 'Confirm email', url: data.url }
			),
			text: `${greeting}\n\nConfirm your email to finish setting up your ${appConfig.title} account:\n${data.url}\n`
		};
	},

	resetPassword(data: { url: string; name?: string }): RenderedEmail {
		const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
		return {
			subject: `Reset your ${appConfig.title} password`,
			html: layout(
				'Reset your password',
				`<p style="line-height:1.6;">${escapeHtml(greeting)} use the link below to choose a new password. It expires in an hour.</p>
				<p style="line-height:1.6;color:#5a5a58;">If you didn't ask for this, ignore this email — nothing has changed.</p>`,
				{ label: 'Reset password', url: data.url }
			),
			text: `${greeting}\n\nReset your password (the link expires in an hour):\n${data.url}\n\nIf you didn't ask for this, ignore this email — nothing has changed.\n`
		};
	},

	invite(data: { url: string; invitedBy?: string; organization?: string }): RenderedEmail {
		const who = data.invitedBy ? escapeHtml(data.invitedBy) : 'Someone';
		const where = data.organization ? escapeHtml(data.organization) : escapeHtml(appConfig.title);
		return {
			subject: `${data.invitedBy ?? 'You have been invited'} — join ${data.organization ?? appConfig.title}`,
			html: layout(
				`Join ${data.organization ?? appConfig.title}`,
				`<p style="line-height:1.6;">${who} invited you to ${where}.</p>`,
				{ label: 'Accept invitation', url: data.url }
			),
			text: `${data.invitedBy ?? 'Someone'} invited you to ${data.organization ?? appConfig.title}.\n\nAccept:\n${data.url}\n`
		};
	},

	contactNotification(data: {
		name: string;
		email: string;
		message: string;
		subject?: string;
	}): RenderedEmail {
		return {
			subject: `Contact form: ${data.subject ?? data.name}`,
			html: layout(
				'New contact form submission',
				`<p style="line-height:1.6;"><strong>${escapeHtml(data.name)}</strong> &lt;${escapeHtml(data.email)}&gt;</p>
				<p style="line-height:1.6;white-space:pre-wrap;">${escapeHtml(data.message)}</p>`
			),
			text: `${data.name} <${data.email}>\n\n${data.message}\n`
		};
	}
} as const;

export type TemplateName = keyof typeof templates;
export type TemplateData<T extends TemplateName> = Parameters<(typeof templates)[T]>[0];
