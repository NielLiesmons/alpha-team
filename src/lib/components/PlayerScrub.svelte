<script>
	import { playerUi, seekPlayback } from '$lib/player.svelte.js';

	/** @type {{ large?: boolean }} */
	let { large = false } = $props();

	const playedPct = $derived(
		playerUi.duration > 0 ? Math.min(100, Math.round((playerUi.currentTime / playerUi.duration) * 100)) : 0
	);
	const bufferPct = $derived(Math.round(Math.min(1, Math.max(0, playerUi.bufferRatio)) * 100));

	/** @param {MouseEvent} e */
	function seek(e) {
		if (!playerUi.duration) return;
		const rect = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
		seekPlayback((e.clientX - rect.left) / rect.width);
	}

	/** @param {number} s */
	function fmt(s) {
		if (!Number.isFinite(s) || s < 0) return '0:00';
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${sec.toString().padStart(2, '0')}`;
	}
</script>

<div class="scrub-block" class:large>
	<button
		type="button"
		class="scrub"
		aria-label="Seek"
		disabled={!playerUi.duration}
		onclick={seek}
	>
		<span class="scrub-track">
			<span class="scrub-buffer" style={`width: ${bufferPct}%`}></span>
			<span class="scrub-played" style={`width: ${playedPct}%`}></span>
		</span>
	</button>
	<div class="times">
		<span>{fmt(playerUi.currentTime)}</span>
		<span>{playerUi.duration > 0 ? fmt(playerUi.duration) : '–:––'}</span>
	</div>
</div>

<style>
	.scrub-block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		width: 100%;
	}

	.scrub-block.large {
		gap: 6px;
	}

	.scrub {
		width: 100%;
		height: 16px;
		display: flex;
		align-items: center;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
	}

	.scrub-block.large .scrub {
		height: 22px;
	}

	.scrub:disabled {
		cursor: default;
	}

	.scrub-track {
		position: relative;
		display: block;
		width: 100%;
		height: 3px;
		border-radius: 2px;
		background: var(--fg-16);
		overflow: hidden;
	}

	.scrub-block.large .scrub-track {
		height: 4px;
		border-radius: 999px;
	}

	.scrub-buffer,
	.scrub-played {
		position: absolute;
		inset: 0 auto 0 0;
		height: 100%;
		pointer-events: none;
	}

	.scrub-buffer {
		background: color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.scrub-played {
		background: var(--accent);
	}

	.times {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		color: var(--fg-33);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		line-height: 1.2;
	}

	.scrub-block.large .times {
		font-size: 12px;
	}
</style>
