<script>
	/**
	 * Light glass popover portaled to body so it is never clipped by modal overflow.
	 * Drop-ups anchor to the trigger’s top edge using the panel’s real height.
	 * Prefer `anchor` for chrome triggers; pass `point` (clientX/Y) for context menus
	 * so the panel opens at the pointer/tap — not below a whole card.
	 */
	import { tick } from 'svelte';

	/**
	 * @type {{
	 *   open?: boolean,
	 *   anchor?: HTMLElement | null,
	 *   point?: { x: number, y: number } | null,
	 *   placement?: 'above' | 'below',
	 *   align?: 'start' | 'end',
	 *   width?: number,
	 *   maxHeight?: number,
	 *   onclose?: () => void,
	 *   children?: import('svelte').Snippet
	 * }}
	 */
	let {
		open = false,
		anchor = null,
		point = null,
		placement = 'above',
		align = 'start',
		width = 280,
		maxHeight = 360,
		onclose = () => {},
		children
	} = $props();

	/** @type {HTMLDivElement | undefined} */
	let panelEl = $state();
	let pos = $state({ top: 0, left: 0 });

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	function reposition() {
		if (typeof window === 'undefined') return;
		const gap = 6;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const panelH = panelEl?.offsetHeight || Math.min(120, maxHeight);

		/** @type {{ top: number, bottom: number, left: number, right: number }} */
		let r;
		if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
			/* 1×1 hit at the pointer so below/above flips around the tap. */
			r = { top: point.y, bottom: point.y, left: point.x, right: point.x };
		} else if (anchor) {
			const br = anchor.getBoundingClientRect();
			r = { top: br.top, bottom: br.bottom, left: br.left, right: br.right };
		} else {
			return;
		}

		let left = align === 'end' ? r.right - width : r.left;
		/* Point menus: center-ish on the tap when align is start. */
		if (point && align === 'start') {
			left = r.left;
		}
		left = Math.max(8, Math.min(left, vw - width - 8));

		let top;
		if (placement === 'below') {
			top = r.bottom + gap;
			if (top + panelH > vh - 8) {
				/* Flip up — sit flush above the trigger */
				top = r.top - gap - panelH;
			}
		} else {
			/* Drop-up: bottom edge of panel sits just above the trigger */
			top = r.top - gap - panelH;
			if (top < 8) {
				top = r.bottom + gap;
			}
		}
		top = Math.max(8, Math.min(top, vh - panelH - 8));
		pos = { top, left };
	}

	$effect(() => {
		if (!open) return;
		anchor;
		point;
		placement;
		void tick().then(reposition);

		const onWin = () => reposition();
		window.addEventListener('resize', onWin);
		window.addEventListener('scroll', onWin, true);

		/** @type {ResizeObserver | undefined} */
		let ro;
		if (panelEl && typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(() => reposition());
			ro.observe(panelEl);
		}

		return () => {
			window.removeEventListener('resize', onWin);
			window.removeEventListener('scroll', onWin, true);
			ro?.disconnect();
		};
	});

	/** Keep the underlying text field focused so the mobile keyboard stays up. */
	/** @param {PointerEvent} e */
	function keepKeyboard(e) {
		const t = e.target;
		if (!(t instanceof HTMLElement)) return;
		if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
		e.preventDefault();
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="float-root" use:portal>
		<button type="button" class="scrim" aria-label="Close" onclick={onclose}></button>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={panelEl}
			class="float-panel alpha-popover"
			role="dialog"
			style:top="{pos.top}px"
			style:left="{pos.left}px"
			style:width="{width}px"
			style:max-height="{maxHeight}px"
			onpointerdown={keepKeyboard}
		>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.float-root {
		position: fixed;
		inset: 0;
		z-index: 120;
		pointer-events: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		margin: 0;
		background: transparent;
		cursor: default;
		pointer-events: auto;
	}

	/* Not named `.panel` — app.css `.panel` is a solid surface card and would
	   override the shared `.alpha-popover` glass at equal specificity. */
	.float-panel {
		position: absolute;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		box-sizing: border-box;
	}
</style>
