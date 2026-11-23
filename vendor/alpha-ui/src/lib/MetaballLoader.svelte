<script>
	/**
	 * Fixed-width three-ball wave loader (no SVG goo / unknown overflow).
	 * Quiet ink by default (`--fg-33`); parents may override via `--loader-ink` / `color`.
	 * @type {{
	 *   size?: 'sm' | 'default' | number,
	 *   label?: string,
	 *   class?: string
	 * }}
	 */
	let { size = 'default', label = 'Loading', class: className = '' } = $props();

	/**
	 * Intrinsic box — never grow/shrink in flex chrome.
	 * sm = title pills (~1.5× prior 18×10); default = boot / empty states.
	 * Number = height in px (width = 1.7× — balls sit a hair closer than 1.8×).
	 * @param {'sm' | 'default' | number} s
	 */
	function dims(s) {
		if (typeof s === 'number' && Number.isFinite(s) && s > 0) {
			const h = Math.max(8, Math.round(s));
			return { w: Math.round(h * 1.7), h };
		}
		if (s === 'sm') return { w: 26, h: 15 };
		return { w: 42, h: 24 };
	}

	const box = $derived(dims(size));
</script>

<span
	class="metaball {className}"
	style="width:{box.w}px;height:{box.h}px"
	role="status"
	aria-label={label}
>
	<span class="ball b1" aria-hidden="true"></span>
	<span class="ball b2" aria-hidden="true"></span>
	<span class="ball b3" aria-hidden="true"></span>
</span>

<style>
	.metaball {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		flex: 0 0 auto;
		flex-shrink: 0;
		box-sizing: border-box;
		/* Optical vertical center in title chrome */
		padding-top: 2px;
		line-height: 0;
		overflow: hidden;
		vertical-align: middle;
		color: var(--loader-ink, var(--fg-33));
		min-width: inherit;
		max-width: none;
		/* Never steal taps from title pill / nav chrome while syncing */
		pointer-events: none;
	}

	.ball {
		display: block;
		flex: 0 0 auto;
		/* Slightly larger fraction + tighter track = balls a hair closer */
		width: 24%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: currentColor;
		animation: mb-wave 1.05s ease-in-out infinite;
	}

	.ball.b2 {
		animation-delay: 0.14s;
	}

	.ball.b3 {
		animation-delay: 0.28s;
	}

	@keyframes mb-wave {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.55;
		}
		50% {
			transform: translateY(-35%);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ball {
			animation: mb-pulse 1.4s ease-in-out infinite;
		}

		.ball.b2 {
			animation-delay: 0.2s;
		}

		.ball.b3 {
			animation-delay: 0.4s;
		}

		@keyframes mb-pulse {
			0%,
			100% {
				opacity: 0.4;
				transform: scale(0.92);
			}
			50% {
				opacity: 1;
				transform: scale(1);
			}
		}
	}
</style>
