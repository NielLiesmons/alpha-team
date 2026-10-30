<script>
	import { syncUi } from '$lib/sync-progress.svelte.js';

	/**
	 * @type {{
	 *   variant?: 'inline' | 'under' | 'detail',
	 *   class?: string
	 * }}
	 */
	let { variant = 'inline', class: className = '' } = $props();

	const known = $derived(typeof syncUi.ratio === 'number');
	const pct = $derived(known ? Math.round((syncUi.ratio ?? 0) * 100) : 0);
</script>

{#if syncUi.active}
	<div
		class="sync-bar {variant} {className}"
		class:indet={!known}
		role="progressbar"
		aria-label={syncUi.label || 'Syncing'}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={known ? pct : undefined}
		aria-valuetext={known ? `${pct}%` : 'Syncing'}
		title={syncUi.label || 'Syncing…'}
	>
		<div class="track">
			<div class="fill" style:width={known ? `${pct}%` : undefined}></div>
		</div>
	</div>
{/if}

<style>
	.sync-bar {
		flex-shrink: 0;
		pointer-events: none;
	}

	.sync-bar.inline {
		width: 72px;
		margin-left: 8px;
	}

	.sync-bar.under,
	.sync-bar.detail {
		width: min(120px, 42%);
		margin: 0 auto;
	}

	.track {
		height: 2px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: inherit;
		background: color-mix(in srgb, var(--fg) 45%, transparent);
		transition: width 0.2s ease;
	}

	.indet .fill {
		width: 36%;
		animation: sync-shimmer 1.1s ease-in-out infinite;
	}

	@keyframes sync-shimmer {
		0% {
			transform: translateX(-120%);
		}
		100% {
			transform: translateX(320%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.indet .fill {
			animation: none;
			width: 100%;
			opacity: 0.45;
		}
	}
</style>
