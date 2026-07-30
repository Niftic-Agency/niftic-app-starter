import { organization } from 'better-auth/plugins';
import { schema } from '$lib/server/db';
import { env } from '$lib/server/env';
import { sendEmail } from '$lib/server/email';

/**
 * The organization plugin, as a LITERAL TUPLE.
 *
 * This is the whole reason the `organizations` selector group exists. Better
 * Auth derives its entire API surface and its session type from the exact tuple
 * handed to `betterAuth()`. Collecting plugins through a registry — the pattern
 * this repo uses for hooks, health, nav and the schema barrel — types the list
 * as `BetterAuthPlugin[]`, and that erases the inference: `auth.api.setRole`,
 * `auth.api.banUser` and `user.role` all disappear along with it. That was
 * built, measured (four type errors) and thrown away.
 *
 * So the list stays literal in `auth.ts`, and configure picks which literal by
 * copying `plugins.orgs.ts` or `plugins.noorgs.ts` over `plugins.ts`. Spreading
 * a tuple into an array literal preserves the tuple, so inference survives.
 *
 * Consequence worth knowing: the plugin CONFIG lives here in `auth-better`, not
 * in the `orgs` variant. One plugin list, one place. The `orgs` variant owns the
 * tables, the authorization helpers and the routes.
 */
export const orgPlugins = [
	organization({
		// Invitation IDs reach organization admins through the members page (the
		// cancel button posts one), so a mailbox is no longer sole proof of
		// ownership. Better Auth's own guidance for that case is to require a
		// verified address on accept/reject/get. Costs nothing here: client mode
		// already requires verification to sign in, and internal mode gets it from
		// Google.
		requireEmailVerificationOnInvitation: true,

		async sendInvitationEmail(data) {
			await sendEmail({
				to: data.email,
				template: 'invite',
				data: {
					// Better Auth deliberately does not build this URL — the invitation
					// id is ours to route. It must be an absolute URL: it is going into
					// an email client, which has no origin to resolve against.
					url: `${env().BETTER_AUTH_URL}/organizations/invitations/${data.id}`,
					invitedBy: data.inviter.user.name || data.inviter.user.email,
					organization: data.organization.name
				}
			});
		}
	})
] as const;

/**
 * The models the Drizzle adapter needs on top of Better Auth's core four.
 *
 * The adapter resolves a model by the KEY in this object, not by the SQL table
 * name, so these keys are Better Auth's model names and must not be renamed.
 */
export const orgAdapterSchema = {
	organization: schema.organization,
	member: schema.member,
	invitation: schema.invitation
};
