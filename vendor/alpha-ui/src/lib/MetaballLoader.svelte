<script>
	/**
	 * Three-ball metaball wave — connected goo, balls stay distinct.
	 * Quiet ink by default (`--fg-33`); parents may override via `color` / class.
	 * @type {{
	 *   size?: 'sm' | 'default' | number,
	 *   label?: string,
	 *   class?: string
	 * }}
	 */
	let { size = 'default', label = 'Loading', class: className = '' } = $props();

	const uid = `mb-${Math.random().toString(36).slice(2, 9)}`;

	/**
	 * sm ≈ title / typing row; default ≈ boot / empty states.
	 * Number = height in px (width scales ~1.75× for three balls).
	 * @param {'sm' | 'default' | number} s
	 */
	function dims(s) {
		if (typeof s === 'number' && Number.isFinite(s) && s > 0) {
			const h = Math.max(10, Math.round(s));
			return { w: Math.round(h * 1.75), h };
		}
		/* sm stays title-chrome friendly so mobile pills don’t collapse to one letter */
		if (s === 'sm') return { w: 22, h: 12 };
		return { w: 44, h: 24 };
	}

	const box = $derived(dims(size));
</script>

<span
	class="metaball {className}"
	style="width:{box.w}px;height:{box.h}px"
	role="status"
	aria-label={label}
>
	<svg
		class="metaball-svg"
		width={box.w}
		height={box.h}
		viewBox="0 0 42 24"
		aria-hidden="true"
		focusable="false"
	>
		<defs>
			<!--
				Visible goo bridges: enough blur + classic threshold so adjacent
				balls connect during the wave, without collapsing into one sausage.
				Do not feComposite SourceGraphic atop goo — that strips bridges.
			-->
			<filter
				id="{uid}-goo"
				x="-50%"
				y="-60%"
				width="200%"
				height="220%"
				color-interpolation-filters="sRGB"
			>
				<feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
				<feColorMatrix
					in="blur"
					mode="matrix"
					values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
					result="goo"
				/>
			</filter>
		</defs>
		<g filter="url(#{uid}-goo)" fill="currentColor">
			<circle class="ball b1" cx="10" cy="12" r="5" />
			<circle class="ball b2" cx="21" cy="12" r="5" />
			<circle class="ball b3" cx="32" cy="12" r="5" />
		</g>
	</svg>
</span>

<style>
	.metaball {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		line-height: 0;
		/*
		 * Quiet ink: use --loader-ink when set, else muted --fg-33.
		 * Title / boot / settle wrappers set --loader-ink or `color` + inherit below.
		 */
		color: var(--loader-ink, var(--fg-33));
		vertical-align: middle;
	}

	.metaball-svg {
		display: block;
		overflow: visible;
	}

	.ball {
		/* translate from circle center so wave stays optically centered in the box */
		transform-box: fill-box;
		transform-origin: center;
		animation: mb-wave 1.05s ease-in-out infinite;
	}

	.ball.b2 {
		animation-delay: 0.14s;
	}

	.ball.b3 {
		animation-delay: 0.28s;
	}

	/* Stronger per-ball travel — staggered delays keep the wave readable */
	@keyframes mb-wave {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-5.5px);
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
				opacity: 0.45;
				transform: translateY(0) scale(0.94);
			}
			50% {
				opacity: 1;
				transform: translateY(0) scale(1.04);
			}
		}
	}
</style>
