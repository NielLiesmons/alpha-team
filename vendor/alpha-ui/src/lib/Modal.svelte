<script>
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { dragDismiss } from './drag-dismiss.js';

	/**
	 * Bottom sheet on small screens, centered floating card on desktop.
	 * Same shell language as CreateSheet (radii, center, sheetSlide).
	 * Mobile: drag down to dismiss. Never show a visual drag handle.
	 */
	let {
		open = $bindable(false),
		label = 'Dialog',
		/** Enable drag-down dismiss on mobile (gesture only — no handle UI) */
		dragDismiss: dragDismissEnabled = true,
		/** 'default' | 'media' — media ≈ 70vw × 90vh desktop viewer */
		size = 'default',
		children
	} = $props();

	function close() {
		open = false;
	}

	/** @param {KeyboardEvent} event */
	function onKey(event) {
		if (open && event.key === 'Escape') close();
	}

	/** @param {HTMLElement} _node @param {{ duration?: number }} [opts] */
	function sheetSlide(_node, { duration = 320 } = {}) {
		const mobile =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
		if (!mobile) {
			return {
				duration: 240,
				easing: cubicOut,
				css: (/** @type {number} */ t, /** @type {number} */ u) =>
					`opacity: ${t}; transform: translate3d(0, ${u * 12}px, 0)`
			};
		}
		return {
			duration,
			easing: (/** @type {number} */ t) => 1 - Math.pow(1 - t, 4),
			css: (/** @type {number} */ _t, /** @type {number} */ u) =>
				`transform: translate3d(0, ${u * 100}%, 0)`
		};
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="overlay"
		class:media={size === 'media'}
		onclick={close}
		role="presentation"
		transition:fade={{ duration: 180 }}
	></div>
	<div
		class="wrap"
		class:media={size === 'media'}
		role="dialog"
		aria-modal="true"
		aria-label={label}
	>
		<div
			class="sheet"
			class:media={size === 'media'}
			transition:sheetSlide
			use:dragDismiss={{ onclose: close, enabled: dragDismissEnabled }}
		>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: var(--scrim);
	}

	.overlay.media {
		z-index: 90;
	}

	.wrap {
		position: fixed;
		z-index: 50;
		top: var(--vv-top, 0px);
		left: 0;
		right: 0;
		height: var(--app-height, 100dvh);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		pointer-events: none;
		box-sizing: border-box;
	}

	.wrap.media {
		z-index: 100;
	}

	.sheet {
		pointer-events: auto;
		width: 100%;
		border: 1px solid var(--glass-border);
		border-bottom: none;
		/* Mobile top radii concentric with 44px chrome buttons (12 pad + 22). */
		border-radius: var(--radius-hero, 34px) var(--radius-hero, 34px) 0 0;
		background: var(--glass-panel);
		padding: 0;
		box-shadow: 0 16px 48px var(--shadow-strong);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		will-change: transform;
		box-sizing: border-box;
		max-height: min(92%, calc(var(--app-height, 100dvh) - 8px), 880px);
		overflow: auto;
	}

	.sheet.media {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	@media (min-width: 768px) {
		.wrap {
			align-items: center;
			padding: 0.55rem;
		}

		.sheet {
			width: min(560px, calc(100vw - 7.5rem));
			max-width: min(560px, calc(100vw - 7.5rem));
			max-height: min(720px, 90svh);
			border-radius: calc(var(--radius-hero, 34px) - 2px);
			border-bottom: 1px solid var(--glass-border);
			overflow: hidden;
		}

		.sheet.media {
			/* Leave side room for external chevrons (same 7.5rem gutter as default). */
			width: min(70vw, calc(100vw - 7.5rem));
			max-width: min(70vw, calc(100vw - 7.5rem));
			height: 90vh;
			max-height: 90vh;
		}
	}
</style>
