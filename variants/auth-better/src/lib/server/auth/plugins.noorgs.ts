/**
 * The no-organizations half of the `organizations` selector group.
 *
 * Empty on purpose, and still a tuple: `[...orgPlugins]` has to keep working in
 * `auth.ts` whichever half was copied, and an empty `readonly []` spreads into
 * an array literal without disturbing the tuple inference the others depend on.
 *
 * See `plugins.orgs.ts` for why this is a file swap rather than a registry.
 */
export const orgPlugins = [] as const;

/** No extra models for the Drizzle adapter to resolve. */
export const orgAdapterSchema = {};
