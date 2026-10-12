<script>
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount } from 'svelte';

	/**
	 * Create / edit surface — one shell only (no nested darker form-box).
	 * - Mobile: bottom sheet (gray66), content rows directly inside
	 * - Desktop: right column panel, same shell treatment, rows directly inside
	 */
	let {
		open = $bindable(false),
		label = 'Create',
		onclose = () => {},
		children
	} = $props();

	let desktop = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		const sync = () => {
			desktop = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	function close() {
		open = false;
		onclose();
	}

	function onKey(event) {
		if (open && event.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	{#if desktop}
		<aside
			class="sheet panel"
			role="dialog"
			aria-modal="true"
			aria-label={label}
			transition:fly={{ x: 48, duration: 220, easing: cubicOut }}
		>
			{@render children?.()}
		</aside>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>
		<div class="wrap" role="dialog" aria-modal="true" aria-label={label}>
			<div class="sheet mobile" transition:fly={{ y: 100, duration: 200, easing: cubicOut }}>
				{@render children?.()}
			</div>
		</div>
	{/if}
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: color-mix(in srgb, var(--black) 72%, transparent);
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

	/* Single shell — Zapstore gray sheet; rows live here directly */
	.sheet {
		display: flex;
		flex-direction: column;
		background: var(--gray66);
		border: 0.33px solid var(--white8);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		overflow: auto;
	}

	.sheet.mobile {
		pointer-events: auto;
		width: 100%;
		max-height: min(88dvh, 720px);
		border-bottom: none;
		border-radius: 28px 28px 0 0;
		padding: 12px 0 calc(12px + env(safe-area-inset-bottom, 0px));
	}

	.sheet.panel {
		flex: 0 0 min(400px, 40vw);
		width: min(400px, 40vw);
		align-self: stretch;
		min-height: 0;
		border-left: 1px solid var(--shell-border);
		border-radius: 0;
		border-top: none;
		border-bottom: none;
		border-right: none;
		padding: 12px 0;
		box-sizing: border-box;
	}
</style>
