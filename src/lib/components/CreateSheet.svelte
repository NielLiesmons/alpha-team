<script>
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	/**
	 * Create / edit overlay — Bley-style centered sheet (not a desktop side column).
	 * Mobile: bottom sheet. Desktop: large centered card. No chrome X (Escape / scrim).
	 */
	let {
		open = false,
		label = 'Create',
		onclose = () => {},
		children
	} = $props();

	function close() {
		// Parent owns `open` — only notify (avoids bindable desync that blocks reopen)
		onclose();
	}

	function onKey(event) {
		if (open && event.key === 'Escape') close();
	}

	/** Soft sheet slide — matches Bley News/Shop modals */
	function sheetSlide(_node, { duration = 320 } = {}) {
		const mobile =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
		if (!mobile) {
			return {
				duration: 240,
				easing: cubicOut,
				css: (t, u) => `opacity: ${t}; transform: translate3d(0, ${u * 14}px, 0)`
			};
		}
		return {
			duration,
			easing: (t) => 1 - Math.pow(1 - t, 4),
			css: (_t, u) => `transform: translate3d(0, ${u * 100}%, 0)`
		};
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>
	<div class="wrap" role="dialog" aria-modal="true" aria-label={label}>
		<div class="sheet" transition:sheetSlide>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: var(--scrim);
		/* Color-only scrim — no blur */
	}

	.wrap {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		pointer-events: none;
		padding: 0;
		box-sizing: border-box;
	}

	.sheet {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: auto;
		max-height: min(92svh, 880px);
		min-height: 0;
		background: var(--glass);
		border: 1px solid var(--glass-border);
		border-bottom: none;
		border-radius: var(--radius-hero) var(--radius-hero) 0 0;
		box-shadow: 0 16px 48px var(--shadow-strong);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		/* Children scroll inside — keeps bottom CTA row pinned */
		overflow: hidden;
		padding: 0 0 calc(14px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
	}

	.sheet > :global(*) {
		min-width: 0;
	}

	@media (min-width: 640px) {
		.wrap {
			align-items: center;
			padding: 0.55rem;
		}

		.sheet {
			width: min(640px, calc(100vw - 7.5rem));
			max-width: min(640px, calc(100vw - 7.5rem));
			height: auto;
			max-height: min(720px, 90svh);
			border-radius: calc(var(--radius-hero) - 2px);
			border-bottom: 1px solid var(--hairline);
			padding: 0 0 14px;
		}
	}
</style>
