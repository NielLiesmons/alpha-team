<script>
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount } from 'svelte';

	/**
	 * Create / edit surface:
	 * - Mobile: bottom sheet — inner form-box only (no gray outer shell)
	 * - Desktop: right column panel beside the feed (third column)
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
			class="panel-col"
			role="dialog"
			aria-modal="true"
			aria-label={label}
			transition:fly={{ x: 48, duration: 220, easing: cubicOut }}
		>
			<div class="form-box">
				{@render children?.()}
			</div>
		</aside>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>
		<div class="mobile-wrap" role="dialog" aria-modal="true" aria-label={label}>
			<div class="form-box sheet" transition:fly={{ y: 100, duration: 200, easing: cubicOut }}>
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

	.mobile-wrap {
		position: fixed;
		z-index: 50;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 0 10px calc(10px + env(safe-area-inset-bottom, 0px));
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.form-box {
		display: flex;
		flex-direction: column;
		background: var(--black33);
		border: 0.33px solid var(--white33);
		border-radius: 16px;
		overflow: visible;
		width: 100%;
	}

	.form-box.sheet {
		pointer-events: auto;
		max-height: min(88dvh, 720px);
		overflow: auto;
	}

	.panel-col {
		flex: 0 0 min(400px, 40vw);
		width: min(400px, 40vw);
		align-self: stretch;
		min-height: 0;
		padding: 12px;
		border-left: 1px solid var(--shell-border);
		background: var(--black);
		overflow: auto;
		box-sizing: border-box;
	}

	.panel-col .form-box {
		min-height: min(100%, 480px);
	}
</style>
