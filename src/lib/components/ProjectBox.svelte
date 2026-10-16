<script>
	/**
	 * Pointy-top hexagon for project status (Chateau-inspired, Alpha tokens).
	 * States: backlog | planned | inProgress | closed (completed) | canceled
	 */
	/** @type {{ state?: string, size?: number, onclick?: ((e: MouseEvent) => void) | null }} */
	let { state = 'planned', size = 24, onclick = null } = $props();

	const PATH = $derived(
		size >= 32
			? 'M 13.299,1.25 L 20.661,5.5 Q 21.96,6.25 21.96,7.75 L 21.96,16.25 Q 21.96,17.75 20.661,18.5 L 13.299,22.75 Q 12,23.5 10.701,22.75 L 3.339,18.5 Q 2.04,17.75 2.04,16.25 L 2.04,7.75 Q 2.04,6.25 3.339,5.5 L 10.701,1.25 Q 12,0.5 13.299,1.25 Z'
			: 'M 13.299,1.75 L 20.227,5.75 Q 21.526,6.5 21.526,8 L 21.526,16 Q 21.526,17.5 20.227,18.25 L 13.299,22.25 Q 12,23 10.701,22.25 L 3.773,18.25 Q 2.474,17.5 2.474,16 L 2.474,8 Q 2.474,6.5 3.773,5.75 L 10.701,1.75 Q 12,1 13.299,1.75 Z'
	);

	const sw = 1.4;
	const checkSize = $derived(size * 0.42);
	const iconSize = $derived(size * 0.5);
	const crossSize = $derived(size * 0.33);
	const crossSw = 4.2;
	const dotR = $derived(size >= 20 ? 2.2 : 1.8);
	const checkSw = $derived(size >= 20 ? 2.8 : 1.4);
	const gradId = $derived(`project-hex-${size}`);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="project-box"
	style="width:{size}px; height:{size}px;"
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	aria-label={onclick ? 'Project status' : undefined}
	{onclick}
	onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(/** @type {any} */ (e)) : undefined}
>
	<svg viewBox="0 0 24 24" width={size} height={size} class="hex" aria-hidden="true">
		{#if state === 'closed'}
			<defs>
				<radialGradient id={gradId} cx="0%" cy="0%" r="150%" gradientUnits="objectBoundingBox">
					<stop offset="0%" stop-color="var(--accent-success)" stop-opacity="1" />
					<stop offset="100%" stop-color="var(--accent-success)" stop-opacity="0.85" />
				</radialGradient>
			</defs>
		{/if}

		{#if state === 'planned'}
			<path d={PATH} fill="var(--fg-8)" stroke="none" />
		{:else if state === 'inProgress'}
			<path d={PATH} fill="var(--fg-8)" stroke="none" />
		{:else if state === 'closed'}
			<path d={PATH} fill="url(#{gradId})" stroke="none" />
		{:else if state === 'canceled'}
			<path d={PATH} fill="var(--fg-8)" stroke="none" />
		{:else}
			<path d={PATH} fill="transparent" stroke="none" />
		{/if}

		{#if state === 'backlog'}
			<path
				d={PATH}
				fill="none"
				stroke="var(--white33)"
				stroke-width={sw}
				stroke-dasharray="3.5 2.5"
				stroke-linecap="round"
			/>
		{:else if state === 'planned'}
			<path d={PATH} fill="none" stroke="var(--white33)" stroke-width={sw} />
		{:else if state === 'inProgress'}
			<path d={PATH} fill="none" stroke="var(--accent-progress-66)" stroke-width={sw} />
		{/if}

		{#if state === 'planned'}
			<circle cx="12" cy="12" r={dotR} fill="var(--white33)" />
		{/if}
	</svg>

	{#if state === 'inProgress'}
		<div class="overlay progress" style:padding-left="{Math.round(size * 0.25)}px">
			<svg width={iconSize} height={iconSize} viewBox="0 0 11 22" aria-hidden="true">
				<path
					fill="var(--accent-progress)"
					d="M1.56676 21.7923C6.89979 21.0318 11 16.4462 11 10.903C11 5.35977 6.89979 0.774213 1.56676 0.0137178C0.70758 -0.108803 0 0.60654 0 1.47442V20.3316C0 21.1994 0.707579 21.9148 1.56676 21.7923Z"
				/>
			</svg>
		</div>
	{:else if state === 'closed'}
		<div class="overlay">
			<svg
				width={checkSize}
				height={checkSize}
				viewBox="0 0 18 14"
				fill="none"
				stroke="var(--white)"
				stroke-width={checkSw}
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M1.5 7.2 6.4 12 16.5 1.5" />
			</svg>
		</div>
	{:else if state === 'canceled'}
		<div class="overlay">
			<svg
				width={crossSize}
				height={crossSize}
				viewBox="0 0 14 14"
				fill="none"
				stroke="var(--white33)"
				stroke-width={crossSw}
				stroke-linecap="round"
				aria-hidden="true"
			>
				<path d="M1 1l12 12M13 1 1 13" />
			</svg>
		</div>
	{/if}
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

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.overlay.progress {
		justify-content: flex-start;
		box-sizing: border-box;
	}
</style>
