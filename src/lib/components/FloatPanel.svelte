<script>
	/**
	 * Light glass popover portaled to body so it is never clipped by modal overflow.
	 */
	import { tick } from 'svelte';

	/**
	 * @type {{
	 *   open?: boolean,
	 *   anchor?: HTMLElement | null,
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
		placement = 'above',
		align = 'start',
		width = 280,
		maxHeight = 360,
		onclose = () => {},
		children
	} = $props();

	/** @type {HTMLDivElement | undefined} */
	let rootEl = $state();
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
		if (!anchor || typeof window === 'undefined') return;
		const r = anchor.getBoundingClientRect();
		const gap = 6;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let left = align === 'end' ? r.right - width : r.left;
		left = Math.max(8, Math.min(left, vw - width - 8));
		let top;
		if (placement === 'below') {
			top = r.bottom + gap;
			if (top + Math.min(maxHeight, 200) > vh - 8) {
				top = Math.max(8, r.top - gap - Math.min(maxHeight, vh * 0.5));
			}
		} else {
			top = r.top - gap - Math.min(maxHeight, vh * 0.55);
			if (top < 8) top = Math.min(vh - 8, r.bottom + gap);
		}
		pos = { top, left };
	}

	$effect(() => {
		if (!open) return;
		anchor;
		void tick().then(reposition);
		const onWin = () => reposition();
		window.addEventListener('resize', onWin);
		window.addEventListener('scroll', onWin, true);
		return () => {
			window.removeEventListener('resize', onWin);
			window.removeEventListener('scroll', onWin, true);
		};
	});

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
	<div class="float-root" use:portal bind:this={rootEl}>
		<button type="button" class="scrim" aria-label="Close" onclick={onclose}></button>
		<div
			class="panel"
			role="dialog"
			style:top="{pos.top}px"
			style:left="{pos.left}px"
			style:width="{width}px"
			style:max-height="{maxHeight}px"
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

	.panel {
		position: absolute;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* Light suggestion-style glass — less opaque than modal panels */
		background: color-mix(in srgb, var(--bg) 52%, transparent);
		border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
		border-radius: 14px;
		box-shadow: 0 10px 36px color-mix(in srgb, var(--fg-raw) 22%, transparent);
		backdrop-filter: blur(18px) saturate(1.15);
		-webkit-backdrop-filter: blur(18px) saturate(1.15);
		overflow: hidden;
		box-sizing: border-box;
	}

	:global(:root[data-theme='light']) .panel {
		background: color-mix(in srgb, var(--bg) 72%, transparent);
	}
</style>
