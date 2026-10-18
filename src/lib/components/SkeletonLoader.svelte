<script>
	/**
	 * Zapstore-style shimmer — fills its parent.
	 * Parent sets size, radius, overflow:hidden.
	 * @type {{ class?: string }}
	 */
	let { class: className = '' } = $props();
</script>

<div class="skeleton-loader {className}" role="status" aria-label="Loading">
	<span class="sr-only">Loading…</span>
</div>

<style>
	.skeleton-loader {
		width: 100%;
		height: 100%;
		background-color: var(--fg-8);
		overflow: hidden;
		position: relative;
		isolation: isolate;
		contain: content;
	}

	.skeleton-loader::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			100deg,
			transparent 0%,
			var(--fg-4) 10%,
			var(--fg-8) 20%,
			var(--fg-16) 50%,
			var(--fg-8) 80%,
			var(--fg-4) 90%,
			transparent 100%
		);
		transform: translateX(-100%);
		animation: skeleton-shimmer 1.2s ease-in-out infinite;
		will-change: transform;
	}

	@keyframes skeleton-shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-loader::after {
			animation: none;
			background: var(--fg-8);
			transform: none;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
