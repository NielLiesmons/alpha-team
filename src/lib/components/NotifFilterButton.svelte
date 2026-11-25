<script>
	/**
	 * Standard list-chrome filter control for the notifications column.
	 * FloatPanel + DS popover rows (icon before every item).
	 * @type {{
	 *   value?: string,
	 *   options?: { id: string, label: string, icon?: import('svelte').Component<any> }[],
	 *   label?: string,
	 *   onchange?: (id: string) => void
	 * }}
	 */
	import FloatPanel from './FloatPanel.svelte';
	import ChevronRight from './icons/ChevronRight.svelte';

	let {
		value = 'all',
		options = /** @type {{ id: string, label: string, icon?: import('svelte').Component<any> }[]} */ ([]),
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
		width={200}
		maxHeight={280}
		onclose={() => (open = false)}
	>
		<div class="alpha-popover-list" role="listbox" aria-label={label}>
			{#each options as opt (opt.id)}
				{@const Icon = opt.icon}
				<button
					type="button"
					class="alpha-popover-item"
					class:on={value === opt.id}
					role="option"
					aria-selected={value === opt.id}
					onclick={() => {
						onchange(opt.id);
						open = false;
					}}
				>
					<span class="alpha-popover-ico" aria-hidden="true">
						{#if Icon}
							<Icon size={16} />
						{:else}
							<ChevronRight size={14} />
						{/if}
					</span>
					<span class="alpha-popover-label">{opt.label}</span>
				</button>
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
