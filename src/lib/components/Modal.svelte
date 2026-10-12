<script>
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	/**
	 * Bottom sheet on small screens, floating sheet on desktop.
	 * Bley modal shell: --modal-bg + hairline (same as public site).
	 */
	let {
		open = $bindable(false),
		label = 'Dialog',
		children
	} = $props();

	function close() {
		open = false;
	}

	function onKey(event) {
		if (open && event.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>
	<div class="wrap" role="dialog" aria-modal="true" aria-label={label}>
		<div class="sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: color-mix(in srgb, var(--black) 65%, transparent);
	}

	.wrap {
		position: fixed;
		z-index: 50;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.sheet {
		pointer-events: auto;
		width: 100%;
		background: var(--modal-bg);
		border: 1px solid var(--hairline);
		border-bottom: none;
		border-radius: var(--radius-hero) var(--radius-hero) 0 0;
		padding: 16px;
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		box-shadow: 0 16px 48px var(--shadow-strong);
	}

	@media (min-width: 768px) {
		.sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 28px;
			border-bottom: 0.33px solid var(--white8);
			padding: 12px;
		}
	}
</style>
