<script>
	/**
	 * Soft five-point star for an Enterprise.
	 * Stroke is always neutral (no accent) — dashed when not active.
	 */
	import { isProjectImageIcon } from '$lib/project-status.js';
	import { ENTERPRISE_STAR_24 } from '$lib/star-path.js';

	/** @type {{ state?: string, icon?: string | null, size?: number, onclick?: ((e: MouseEvent) => void) | null }} */
	let { state = 'active', icon = null, size = 24, onclick = null } = $props();

	const PATH = ENTERPRISE_STAR_24;
	const sw = 1.4;
	const hasIcon = $derived(Boolean(icon && String(icon).trim()));
	const isImage = $derived(hasIcon && isProjectImageIcon(icon));
	const glyphSize = $derived(Math.round(size * 0.58));
	const muted = $derived(
		state === 'draft' || state === 'paused' || state === 'closed' || state === 'archived'
	);
	const stroke = $derived(muted ? 'var(--white16)' : 'var(--white33)');
	const dash = $derived(muted ? '3.5 2.5' : undefined);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="enterprise-box"
	style="width:{size}px; height:{size}px;"
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	aria-label={onclick ? 'Enterprise icon' : undefined}
	{onclick}
	onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(/** @type {any} */ (e)) : undefined}
>
	<svg viewBox="0 0 24 24" width={size} height={size} class="star" aria-hidden="true">
		<path d={PATH} fill="var(--box-plate)" stroke="none" />
		<path
			d={PATH}
			fill="none"
			stroke={stroke}
			stroke-width={sw}
			stroke-dasharray={dash}
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>

	<div class="center" aria-hidden="true">
		{#if isImage}
			<img class="icon-img" src={icon} alt="" width={glyphSize} height={glyphSize} />
		{:else if hasIcon}
			<span class="icon-emoji" style:font-size="{Math.round(size * 0.52)}px">{icon}</span>
		{:else}
			<span
				class="placeholder"
				style:width="{Math.round(size * 0.18)}px"
				style:height="{Math.round(size * 0.18)}px"
			></span>
		{/if}
	</div>
</div>

<style>
	.enterprise-box {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
		cursor: default;
	}

	.enterprise-box[role='button'] {
		cursor: pointer;
	}

	.star {
		position: absolute;
		inset: 0;
		display: block;
	}

	.center {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 1;
	}

	.icon-img {
		object-fit: cover;
		border-radius: 4px;
		display: block;
	}

	/* Color-emoji fonts sit optically left — nudge into star center */
	.icon-emoji {
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		width: 1.15em;
		margin-left: 0.1em;
		text-align: center;
		user-select: none;
	}

	.placeholder {
		border-radius: 999px;
		background: var(--white33);
		display: block;
	}
</style>
