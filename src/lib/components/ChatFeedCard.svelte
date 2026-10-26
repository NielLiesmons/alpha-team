<script>
	/**
	 * Family chat feed row — same grammar as Zapstore CommentCard:
	 * content tip (badge + one-liner) → vertical spine → avatar → bubble
	 * (optional in-bubble quote). Adapted for Alpha entities, not a clone.
	 */
	import NavIcon from './NavIcon.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { profileTextColor, stringToColor } from '$lib/color.js';
	import { themeChoice } from '$lib/theme.svelte.js';

	/**
	 * @type {{
	 *   msg: any,
	 *   parent?: any | null,
	 *   refMeta?: { kind: string, title: string, icon: string } | null,
	 *   when?: string,
	 *   onclick?: () => void
	 * }}
	 */
	let { msg, parent = null, refMeta = null, when = '', onclick } = $props();

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	const person = $derived(asPerson(msg.author));
	const name = $derived(person?.name || displayNameFromEmail(msg.author));
	const parentPerson = $derived(parent ? asPerson(parent.author) : null);
	const parentName = $derived(
		parent ? parentPerson?.name || displayNameFromEmail(parent.author) : ''
	);
	const isReply = $derived(Boolean(parent));
	const hasRoot = $derived(Boolean(refMeta));

	function nameColor(email, label) {
		const rgb = stringToColor(email || label || 'A');
		return profileTextColor(rgb, isDark);
	}

	function accentRgb(email, label) {
		const rgb = stringToColor(email || label || 'A');
		return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
	}

	function preview(text, max = 80) {
		const plain = String(text || '')
			.replace(/\s+/g, ' ')
			.trim();
		if (plain.length <= max) return plain;
		return `${plain.slice(0, max).trim()}…`;
	}
</script>

<article class="card">
	<div class="left-col">
		{#if hasRoot}
			<button
				type="button"
				class="root-badge"
				aria-label={refMeta ? `${refMeta.kind}: ${refMeta.title}` : 'Open'}
				onclick={(e) => {
					e.stopPropagation();
					onclick?.();
				}}
			>
				<NavIcon name={refMeta?.icon || 'chat'} size={14} />
			</button>
			{#if isReply}
				<div class="line-dotted" aria-hidden="true"></div>
			{/if}
			<div class="line-solid" aria-hidden="true"></div>
		{/if}
		<div class="avatar-wrap">
			<ProfilePic name={name} size={34} />
		</div>
	</div>

	<div class="right-col">
		{#if hasRoot && refMeta}
			<button
				type="button"
				class="root-label-row"
				onclick={(e) => {
					e.stopPropagation();
					onclick?.();
				}}
			>
				<span class="root-kind">{refMeta.kind}</span>
				<span class="root-title">{refMeta.title}</span>
			</button>
		{/if}

		<button type="button" class="bubble" class:quoted={isReply} onclick={() => onclick?.()}>
			<div class="bubble-head">
				<span class="author" style:color={nameColor(msg.author, name)}>{name}</span>
				{#if when}<span class="when">{when}</span>{/if}
			</div>
			{#if parent}
				<div class="quote">
					<div
						class="quote-bar"
						style:background={accentRgb(parent.author, parentName)}
						aria-hidden="true"
					></div>
					<div class="quote-body">
						<span class="quote-name" style:color={nameColor(parent.author, parentName)}
							>{parentName}</span
						>
						<span class="quote-text">{preview(parent.body)}</span>
					</div>
				</div>
			{/if}
			<p class="text">{msg.body}</p>
		</button>
	</div>
</article>

<style>
	.card {
		display: flex;
		gap: 8px;
		align-items: stretch;
		width: 100%;
	}

	.left-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 36px;
	}

	.root-badge {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: var(--fg-8);
		color: var(--fg-66);
		cursor: pointer;
	}

	.root-badge:hover {
		color: var(--fg);
		background: var(--fg-11, var(--fg-8));
	}

	.line-dotted {
		width: 2px;
		flex: 1;
		min-height: 6px;
		background: repeating-linear-gradient(
			to bottom,
			color-mix(in srgb, var(--fg) 16%, transparent) 0px,
			color-mix(in srgb, var(--fg) 16%, transparent) 6px,
			transparent 6px,
			transparent 10px
		);
	}

	.line-solid {
		width: 2px;
		flex: 1;
		min-height: 8px;
		background: color-mix(in srgb, var(--fg) 16%, transparent);
	}

	.avatar-wrap {
		flex-shrink: 0;
		line-height: 0;
	}

	.right-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}

	.root-label-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 28px;
		min-width: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.root-kind {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.root-title {
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.root-label-row:hover .root-title,
	.root-label-row:hover .root-kind {
		color: var(--fg);
	}

	.bubble {
		width: fit-content;
		max-width: 100%;
		min-width: 200px;
		padding: 8px 12px 8px;
		border: 0;
		border-radius: 14px 14px 14px 4px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}

	.bubble.quoted {
		min-width: 240px;
	}

	.bubble:hover {
		background: color-mix(in srgb, var(--fg) 11%, transparent);
	}

	.bubble-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 4px;
	}

	.author {
		font-size: 13px;
		font-weight: 600;
	}

	.when {
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
		flex-shrink: 0;
	}

	.quote {
		display: flex;
		min-width: 0;
		margin-bottom: 6px;
		border-radius: 8px;
		overflow: hidden;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.quote-bar {
		width: 2.8px;
		flex-shrink: 0;
		align-self: stretch;
	}

	.quote-body {
		flex: 1;
		min-width: 0;
		padding: 5px 10px 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.quote-name {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quote-text {
		font-size: 12px;
		line-height: 1.3;
		color: var(--fg-66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.text {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: color-mix(in srgb, var(--fg) 85%, transparent);
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
