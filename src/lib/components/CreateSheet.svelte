<script>
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	/** Chateau-style create sheet: dim, then a gray sheet holding a black33 form box. */
	let {
		open = $bindable(false),
		label = 'Create',
		onclose = () => {},
		children
	} = $props();

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
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>
	<div class="wrap" role="dialog" aria-modal="true" aria-label={label}>
		<div class="sheet" transition:fly={{ y: 100, duration: 200, easing: cubicOut }}>
			<div class="form-box">
				{@render children?.()}
			</div>
		</div>
	</div>
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

	.sheet {
		pointer-events: auto;
		width: 100%;
		background: var(--gray66);
		border: 0.33px solid var(--white8);
		border-bottom: none;
		border-radius: 28px 28px 0 0;
		padding: 16px;
		backdrop-filter: blur(24px);
	}

	.form-box {
		display: flex;
		flex-direction: column;
		background: var(--black33);
		border: 0.33px solid var(--white33);
		border-radius: 16px;
		overflow: visible;
	}

	@media (min-width: 768px) {
		.sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid var(--white8);
			padding: 12px;
		}
	}
</style>
