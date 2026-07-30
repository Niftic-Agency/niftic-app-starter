/**
 * Navigation contract.
 *
 * Variants contribute nav entries through their `registries.nav` declaration
 * rather than editing a layout, so `orgs`, `admin` and `example` can all add
 * links without any of them owning `+layout.svelte`.
 */
export interface NavItem {
	label: string;
	href: string;
	/** Where the link belongs. */
	area: 'site' | 'app' | 'admin';
	/** Lower sorts first. */
	order: number;
	/** Hide unless the signed-in user has this role. */
	role?: 'admin' | 'user';
}
