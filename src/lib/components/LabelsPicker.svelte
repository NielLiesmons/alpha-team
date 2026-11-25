<script>
	/**
	 * Zapstore-style labels panel: tag-shaped search/add + default chips.
	 */
	import { stringToColor } from '$lib/color.js';
	import { DEFAULT_LABELS } from '$lib/labels.js';
	import LabelPill from './LabelPill.svelte';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   selected?: string[],
	 *   ontoggle?: (label: string) => void,
	 *   onadd?: (label: string) => void
	 * }}
	 */
	let { selected = [], ontoggle = () => {}, onadd = () => {} } = $props();

	let draft = $state('');

	const q = $derived(draft.trim().toLowerCase());
	const suggestions = $derived.by(() => {
		const base = DEFAULT_LABELS.filter((l) => !q || l.toLowerCase().includes(q));
		/* Also surface already-selected custom labels that match search */
		for (const l of selected) {
			if (!DEFAULT_LABELS.includes(l) && (!q || l.toLowerCase().includes(q)) && !base.includes(l)) {
				base.push(l);
			}
		}
		return base;
	});

	const fieldColor = $derived.by(() => {
		const t = draft.trim();
		if (!t) return null;
		const c = stringToColor(t);
		return `rgba(${c.r}, ${c.g}, ${c.b}, 0.16)`;
	});

	function submit() {
		const text = draft.trim();
		if (!text) return;
		onadd(text);
		draft = '';
	}

	/** @param {string} label */
	function tap(label) {
		ontoggle(label);
	}
</script>

<div class="labels-picker">
	<form
		class="label-field"
		style:--field-bg={fieldColor ?? 'var(--fg-8)'}
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<input
			class="label-field-input"
			type="text"
			placeholder={t('meta.searchLabel')}
			bind:value={draft}
			aria-label={t('meta.searchLabel')}
		/>
		<svg class="triangle" viewBox="0 0 24 32" fill="none" aria-hidden="true">
			<path
				d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z"
				fill="var(--field-bg)"
			/>
		</svg>
	</form>

	<div class="chips" role="listbox" aria-label={t('meta.labels')}>
		{#each suggestions as label (label)}
			{@const on = selected.includes(label)}
			<button
				type="button"
				class="chip"
				class:on
				role="option"
				aria-selected={on}
				onclick={() => tap(label)}
			>
				<LabelPill text={label} size="meta" />
				{#if on}
					<svg class="check" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M3.2 8.2 L6.4 11.3 L12.8 4.5"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				{/if}
			</button>
		{/each}
		{#if suggestions.length === 0 && q}
			<button type="button" class="create" onclick={submit}>
				Create “{draft.trim()}”
			</button>
		{/if}
	</div>
</div>

<style>
	.labels-picker {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px;
		min-width: 0;
		box-sizing: border-box;
	}

	.label-field {
		display: flex;
		align-items: stretch;
		height: 36px;
		flex-shrink: 0;
	}

	.label-field-input {
		flex: 1;
		min-width: 0;
		height: 36px;
		margin: 0;
		padding: 0 6px 0 12px;
		border: 0;
		border-radius: 12px 0 0 12px;
		background: var(--field-bg);
		color: var(--fg);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		outline: none;
		box-sizing: border-box;
	}

	.label-field-input::placeholder {
		color: var(--fg-33);
		font-weight: 500;
	}

	.triangle {
		flex-shrink: 0;
		width: 24px;
		height: 36px;
		display: block;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 6px;
		align-items: center;
		max-height: 220px;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
		color: var(--fg);
		-webkit-tap-highlight-color: transparent;
	}

	.chip :global(.label) {
		pointer-events: none;
	}

	.chip.on {
		opacity: 1;
	}

	.check {
		flex-shrink: 0;
		color: var(--fg-66);
	}

	.create {
		display: block;
		width: 100%;
		margin: 0;
		padding: 8px 4px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.create:hover {
		color: var(--fg);
		background: var(--fg-4);
	}
</style>
