<script>
	/**
	 * Standard list-chrome filter control for the notifications column.
	 * @type {{
	 *   value?: string,
	 *   options?: { id: string, label: string }[],
	 *   label?: string,
	 *   onchange?: (id: string) => void
	 * }}
	 */
	import FloatPanel from './FloatPanel.svelte';

	let {
		value = 'all',
		options = /** @type {{ id: string, label: string }[]} */ ([]),
		label = 'Filter',
		onchange = /** @type {(id: string) => void} */ (() => {})
	} = $props();

	let open = $state(false);
	/** @type {HTMLButtonElement | undefined} */
	let btn = $state();
	const active = $derived(value !== 'all');
</script>

<div class="notif-filter-wrap">
	<button
		bind:this={btn}
		type="button"
		class="notif-filter-btn"
		class:on={active || open}
		aria-label={label}
		aria-expanded={open}
		aria-haspopup="listbox"
		onclick={() => (open = !open)}
	>
		<svg class="notif-filter-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M2.5 4h11M4.5 8h7M6.5 12h3"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		</svg>
	</button>
	<FloatPanel
		{open}
		anchor={btn}
		placement="below"
		align="end"
		width={180}
		maxHeight={280}
		onclose={() => (open = false)}
	>
		<div class="notif-filter-menu" role="listbox">
			{#each options as opt (opt.id)}
				<button
					type="button"
					class:on={value === opt.id}
					onclick={() => {
						onchange(opt.id);
						open = false;
					}}>{opt.label}</button
				>
			{/each}
		</div>
	</FloatPanel>
</div>

<style>
	.notif-filter-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.notif-filter-btn {
		width: 28px;
		height: 28px;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: var(--fg-8);
		color: var(--fg-66);
		cursor: pointer;
		box-sizing: border-box;
		-webkit-tap-highlight-color: transparent;
		transition:
			transform 0.15s ease,
			color 0.15s ease,
			background 0.15s ease;
	}

	.notif-filter-btn:hover,
	.notif-filter-btn.on,
	.notif-filter-btn[aria-expanded='true'] {
		transform: scale(1.06);
		color: var(--fg);
	}

	.notif-filter-btn:active {
		transform: scale(0.96);
	}

	.notif-filter-ico {
		display: block;
		width: 16px;
		height: 16px;
	}

	.notif-filter-menu {
		display: flex;
		flex-direction: column;
		padding: 4px 0;
	}

	.notif-filter-menu button {
		display: block;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.notif-filter-menu button:hover,
	.notif-filter-menu button.on {
		background: var(--fg-4);
		color: var(--fg);
	}

	.notif-filter-menu button.on {
		font-weight: 600;
	}

	@media (max-width: 767px) {
		.notif-filter-btn {
			width: 44px;
			height: 44px;
			border: 1px solid transparent;
			background:
				linear-gradient(var(--glass), var(--glass)) padding-box,
				var(--glass-shine) border-box;
			backdrop-filter: blur(var(--glass-blur));
			-webkit-backdrop-filter: blur(var(--glass-blur));
		}

		/* Match UiShell / Tasks list chrome-ico on mobile */
		.notif-filter-ico {
			width: 22px;
			height: 22px;
		}
	}
</style>
