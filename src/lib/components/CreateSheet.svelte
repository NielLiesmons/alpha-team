<script>
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import {
		isSheetCovered,
		isTopSheet,
		sheetClosed,
		sheetIndex,
		sheetOpened,
		sheetStack
	} from '$lib/sheet-stack.svelte.js';

	/**
	 * Create / edit overlay — mobile bottom sheet, desktop centered card.
	 * Nested: open another CreateSheet with nested — parent scales under the SAME scrim
	 * (Zapstore showInOtherModal: light barrier, no scrim color swap).
	 */
	let {
		open = false,
		label = 'Create',
		sheetId = '',
		nested = false,
		onclose = () => {},
		children
	} = $props();

	const id = $derived(sheetId || `sheet-${label}`);
	const depth = $derived(sheetIndex(id));
	const covered = $derived(isSheetCovered(id));
	const top = $derived(isTopSheet(id));
	const _stackLen = $derived(sheetStack.length);

	$effect(() => {
		if (open) sheetOpened(id);
		else sheetClosed(id);
		return () => sheetClosed(id);
	});

	function close() {
		if (!top) return;
		onclose();
	}

	function onKey(event) {
		if (!open || !top) return;
		if (event.key === 'Escape') {
			event.stopPropagation();
			close();
		}
	}

	function sheetSlide(_node, { duration = 320 } = {}) {
		const mobile =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
		if (!mobile) {
			return {
				duration: 240,
				easing: cubicOut,
				css: (t, u) => `opacity: ${t}; transform: translate3d(0, ${u * 12}px, 0)`
			};
		}
		return {
			duration,
			easing: (t) => 1 - Math.pow(1 - t, 4),
			css: (_t, u) => `transform: translate3d(0, ${u * 100}%, 0)`
		};
	}

	const zOverlay = $derived(60 + Math.max(0, depth) * 12);
	const zWrap = $derived(70 + Math.max(0, depth) * 12);
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	{#if !nested}
		<!-- Base scrim stays for the whole stack — never swap color when nesting -->
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="overlay"
			style:z-index={zOverlay}
			onclick={() => {
				if (top) close();
			}}
			role="presentation"
			transition:fade={{ duration: 180 }}
		></div>
	{:else if top}
		<!-- Nested: invisible dismiss layer only — no extra darkening -->
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="hit" style:z-index={zOverlay} onclick={close} role="presentation"></div>
	{/if}
	<div
		class="wrap"
		class:covered
		style:z-index={zWrap}
		role="dialog"
		aria-modal="true"
		aria-label={label}
		aria-hidden={covered ? 'true' : undefined}
	>
		<div class="sheet" class:covered class:nested data-stack={_stackLen} transition:sheetSlide>
			<div class="sheet-inner">
				{@render children?.()}
			</div>
			{#if covered}
				<div class="cover-veil" aria-hidden="true"></div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: var(--scrim);
	}

	.hit {
		position: fixed;
		inset: 0;
		background: transparent;
	}

	.wrap {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		pointer-events: none;
		padding: 0;
		box-sizing: border-box;
	}

	.wrap.covered {
		pointer-events: none;
	}

	.sheet {
		position: relative;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: auto;
		max-height: min(92svh, 880px);
		min-height: 0;
		border: 1px solid var(--glass-border);
		border-bottom: none;
		border-radius: var(--radius-hero) var(--radius-hero) 0 0;
		background: var(--glass-panel);
		box-shadow: 0 16px 48px var(--shadow-strong);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		overflow: hidden;
		padding: 0 0 calc(14px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		transform-origin: 50% 100%;
		transition: transform 0.28s var(--ease);
	}

	.sheet.covered {
		transform: scale(0.96);
		pointer-events: none;
	}

	.sheet-inner {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		overflow: hidden;
	}

	.sheet-inner > :global(*) {
		min-width: 0;
	}

	.cover-veil {
		position: absolute;
		inset: 0;
		z-index: 2;
		/* Soft dim of the parent sheet only — not a second scrim */
		background: color-mix(in srgb, var(--bg) 22%, transparent);
		pointer-events: none;
	}

	@media (min-width: 640px) {
		.wrap {
			align-items: center;
			padding: 0.55rem;
		}

		.sheet {
			/* Nested keeps the same width as the parent sheet */
			width: min(640px, calc(100vw - 7.5rem));
			max-width: min(640px, calc(100vw - 7.5rem));
			height: auto;
			max-height: min(720px, 90svh);
			border-radius: calc(var(--radius-hero) - 2px);
			border-bottom: 1px solid var(--glass-border);
			padding: 0 0 14px;
			transform-origin: 50% 50%;
		}

		.sheet.nested {
			/* Slightly taller is fine for pickers; not much narrower */
			max-height: min(680px, 88svh);
		}

		.sheet.covered {
			transform: scale(0.95);
		}
	}
</style>
