<script>
	/**
	 * Pointy-top hexagon for a project — outline encodes derived status;
	 * center shows emoji / image icon when set.
	 */
	import { isProjectImageIcon } from '$lib/project-status.js';

	/** @type {{ state?: string, icon?: string | null, size?: number, onclick?: ((e: MouseEvent) => void) | null }} */
	let { state = 'planned', icon = null, size = 24, onclick = null } = $props();

	const PATH = $derived(
		size >= 32
			? 'M 13.299,1.25 L 20.661,5.5 Q 21.96,6.25 21.96,7.75 L 21.96,16.25 Q 21.96,17.75 20.661,18.5 L 13.299,22.75 Q 12,23.5 10.701,22.75 L 3.339,18.5 Q 2.04,17.75 2.04,16.25 L 2.04,7.75 Q 2.04,6.25 3.339,5.5 L 10.701,1.25 Q 12,0.5 13.299,1.25 Z'
			: 'M 13.299,1.75 L 20.227,5.75 Q 21.526,6.5 21.526,8 L 21.526,16 Q 21.526,17.5 20.227,18.25 L 13.299,22.25 Q 12,23 10.701,22.25 L 3.773,18.25 Q 2.474,17.5 2.474,16 L 2.474,8 Q 2.474,6.5 3.773,5.75 L 10.701,1.75 Q 12,1 13.299,1.75 Z'
	);

	const sw = 1.4;
	const hasIcon = $derived(Boolean(icon && String(icon).trim()));
	const isImage = $derived(hasIcon && isProjectImageIcon(icon));
	const glyphSize = $derived(Math.round(size * 0.48));
	const stroke = $derived.by(() => {
		if (state === 'backlog') return 'var(--white33)';
		if (state === 'inProgress') return 'var(--accent-2-66)';
		if (state === 'closed') return 'var(--accent-1-66)';
		if (state === 'canceled') return 'var(--white16)';
		return 'var(--white33)';
	});
	const dash = $derived(state === 'backlog' ? '3.5 2.5' : undefined);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="project-box"
	style="width:{size}px; height:{size}px;"
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	aria-label={onclick ? 'Project icon' : undefined}
	{onclick}
	onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(/** @type {any} */ (e)) : undefined}
>
	<svg viewBox="0 0 24 24" width={size} height={size} class="hex" aria-hidden="true">
		<path d={PATH} fill="var(--fg-8)" stroke="none" />
		<path
			d={PATH}
			fill="none"
			stroke={stroke}
			stroke-width={sw}
			stroke-dasharray={dash}
			stroke-linecap="round"
		/>
	</svg>

	<div class="center" aria-hidden="true">
		{#if isImage}
			<img class="icon-img" src={icon} alt="" width={glyphSize} height={glyphSize} />
		{:else if hasIcon}
			<span class="icon-emoji" style:font-size="{Math.round(size * 0.42)}px">{icon}</span>
		{:else}
			<span class="placeholder" style:width="{Math.round(size * 0.18)}px" style:height="{Math.round(size * 0.18)}px"
			></span>
		{/if}
	</div>
</div>

<style>
	.project-box {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
		cursor: default;
	}

	.project-box[role='button'] {
		cursor: pointer;
	}

	.hex {
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

	.icon-emoji {
		line-height: 1;
		user-select: none;
	}

	.placeholder {
		border-radius: 999px;
		background: var(--white33);
		display: block;
	}
</style>
