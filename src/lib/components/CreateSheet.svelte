<script>
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount } from 'svelte';

	/**
	 * Create / edit — Bley modal surface tokens (not Zapstore gray66).
	 * Mobile: bottom sheet = the rounded modal; rows directly inside.
	 * Desktop: column + rounded sheet one level in (Bley modal bg).
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
		<aside class="panel-col" aria-label={label}>
			<div
				class="sheet"
				role="dialog"
				aria-modal="true"
				aria-label={label}
				transition:fly={{ x: 40, duration: 220, easing: cubicOut }}
			>
				{@render children?.()}
			</div>
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
		background: var(--scrim);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
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

	/* Column only — page bg; rounded modal is the child */
	.panel-col {
		flex: 0 0 min(400px, 40vw);
		width: min(400px, 40vw);
		align-self: stretch;
		min-height: 0;
		padding: 12px;
		border-left: 1px solid var(--hairline);
		background: var(--black);
		box-sizing: border-box;
		overflow: auto;
	}

	/* Bley modal shell — content rows live directly here */
	.sheet {
		display: flex;
		flex-direction: column;
		background: var(--modal-bg);
		border: 1px solid var(--hairline);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		box-shadow: 0 16px 48px var(--shadow-strong);
		overflow: auto;
	}

	.sheet.mobile {
		pointer-events: auto;
		width: 100%;
		max-height: min(88dvh, 720px);
		border-bottom: none;
		border-radius: var(--radius-hero) var(--radius-hero) 0 0;
		padding: 12px 0 calc(12px + env(safe-area-inset-bottom, 0px));
	}

	.panel-col .sheet {
		min-height: min(100%, 520px);
		border-radius: 24px;
		padding: 8px 0;
	}
</style>
