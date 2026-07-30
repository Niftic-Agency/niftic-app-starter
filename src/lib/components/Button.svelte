<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	type Props = {
		variant?: Variant;
		size?: Size;
		/** Render an anchor instead of a button. */
		href?: string;
		class?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes, 'class'> &
		Omit<HTMLAnchorAttributes, 'class'>;

	let {
		variant = 'primary',
		size = 'md',
		href,
		class: className,
		children,
		...rest
	}: Props = $props();

	const variants: Record<Variant, string> = {
		primary: 'bg-accent text-accent-foreground hover:opacity-90',
		secondary: 'border border-line-strong bg-surface hover:bg-muted',
		ghost: 'hover:bg-muted',
		danger: 'bg-danger text-danger-foreground hover:opacity-90'
	};

	const sizes: Record<Size, string> = {
		sm: 'h-8 px-3 text-sm',
		md: 'h-10 px-4 text-sm',
		lg: 'h-12 px-6 text-base'
	};

	// `className` last so a caller's classes win — that's what cn() is for.
	const classes = $derived(
		cn(
			'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[opacity,background-color] disabled:pointer-events-none disabled:opacity-50',
			variants[variant],
			sizes[size],
			className
		)
	);
</script>

{#if href}
	<a {href} class={classes} {...rest as HTMLAnchorAttributes}>{@render children()}</a>
{:else}
	<button type="button" class={classes} {...rest as HTMLButtonAttributes}>
		{@render children()}
	</button>
{/if}
