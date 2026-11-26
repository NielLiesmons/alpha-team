<script>
	/**
	 * Password / passphrase input with show/hide toggle.
	 * Variants:
	 * - bare  — chrome-less flex child (field-shell + CTA)
	 * - pill  — Settings / DriveInvite bordered round field
	 * - panel — Welcome / Add Profile centered passphrase
	 */
	import Eye from './icons/Eye.svelte';
	import EyeOff from './icons/EyeOff.svelte';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {{
	 *   value?: string,
	 *   variant?: 'bare' | 'pill' | 'panel',
	 *   autocomplete?: string,
	 *   placeholder?: string,
	 *   disabled?: boolean,
	 *   spellcheck?: boolean | 'true' | 'false',
	 *   name?: string,
	 *   id?: string,
	 *   class?: string,
	 *   inputClass?: string,
	 *   onkeydown?: (e: KeyboardEvent) => void,
	 *   element?: HTMLInputElement | undefined
	 * }} */
	let {
		value = $bindable(''),
		variant = 'pill',
		autocomplete = 'off',
		placeholder = '',
		disabled = false,
		spellcheck = false,
		name = undefined,
		id = undefined,
		class: className = '',
		inputClass = '',
		onkeydown = undefined,
		element = $bindable(undefined)
	} = $props();

	let show = $state(false);

	const label = $derived(
		show ? t('common.hidePassword') : t('common.showPassword')
	);
</script>

<div class="pw {variant} {className}" class:disabled>
	<input
		bind:this={element}
		class="pw-input {inputClass}"
		type={show ? 'text' : 'password'}
		bind:value
		{autocomplete}
		{placeholder}
		{disabled}
		{spellcheck}
		{name}
		{id}
		{onkeydown}
	/>
	<button
		type="button"
		class="reveal"
		{disabled}
		aria-label={label}
		aria-pressed={show}
		tabindex="-1"
		onclick={() => {
			if (disabled) return;
			show = !show;
		}}
	>
		{#if show}
			<EyeOff size={variant === 'bare' ? 16 : 18} />
		{:else}
			<Eye size={variant === 'bare' ? 16 : 18} />
		{/if}
	</button>
</div>

<style>
	.pw {
		position: relative;
		display: flex;
		align-items: center;
		box-sizing: border-box;
		min-width: 0;
	}

	.pw.disabled {
		opacity: 0.55;
	}

	.pw-input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--fg, var(--white));
		font: inherit;
		outline: none;
		box-sizing: border-box;
	}

	.pw-input::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
	}

	.reveal {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--fg-66, var(--white66));
		cursor: pointer;
		line-height: 0;
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.14s ease;
	}

	.reveal:hover:not(:disabled) {
		transform: scale(1.06);
		color: var(--fg-66, var(--white66));
	}

	.reveal:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* ── bare: inside field-shell next to CTA ─────────── */
	.pw.bare {
		flex: 1;
		min-width: 0;
		gap: 0;
	}

	.pw.bare .pw-input {
		height: 40px;
		padding: 0 4px 0 14px;
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.pw.bare .reveal {
		width: 36px;
		height: 36px;
		border-radius: 999px;
	}

	/* ── pill: Settings / admin stack rows ────────────── */
	.pw.pill {
		width: 100%;
		height: 2.25rem;
		padding: 0 0.2rem 0 0;
		border-radius: 999px;
		border: 1px solid var(--fg-8, var(--white11));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
	}

	.pw.pill.tall {
		height: 3rem;
	}

	.pw.pill:focus-within {
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.pw.pill .pw-input {
		height: 100%;
		padding: 0 0.35rem 0 0.65rem;
		font-weight: 400;
	}

	.pw.pill .reveal {
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
	}

	/* ── panel: Welcome / Add Profile centered field ─── */
	.pw.panel {
		width: 100%;
	}

	.pw.panel .pw-input {
		width: 100%;
		height: 44px;
		padding: 0 44px 0 12px;
		text-align: center;
		letter-spacing: 0.02em;
		font-size: 1rem;
		font-weight: 400;
		border-radius: 12px;
	}

	.pw.panel .pw-input::placeholder {
		text-align: center;
	}

	.pw.panel .reveal {
		position: absolute;
		right: 2px;
		top: 50%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		border-radius: 999px;
	}

	.pw.panel .reveal:hover:not(:disabled) {
		transform: translateY(-50%) scale(1.06);
	}
</style>
