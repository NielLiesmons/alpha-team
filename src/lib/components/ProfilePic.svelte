<script>
	/**
	 * Circular profile pic — initial when named, Zapstore-style person icon when empty.
	 * Hue from email when available (same seed as quote bars / author names).
	 */
	import { stringToColor, profileTextColor, profileColorSeed } from '$lib/color.js';
	import { themeChoice } from '$lib/theme.svelte.js';

	let {
		name = '',
		email = '',
		size = 24,
		pictureUrl = /** @type {string | null} */ (null),
		/** Skip hairline ring (e.g. stacked reaction pfps). */
		bare = false
	} = $props();

	const initial = $derived(name?.trim()?.[0]?.toUpperCase() ?? '');
	const color = $derived(stringToColor(profileColorSeed(email, name)));
	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});
	const text = $derived(profileTextColor(color, isDark));
	const bg = $derived(
		name?.trim()
			? `rgba(${color.r}, ${color.g}, ${color.b}, 0.24)`
			: 'color-mix(in srgb, var(--fg) 10%, transparent)'
	);
	/* `size` is design-px at --ui-scale:1; render rem so avatars track root rem. */
	const rem = $derived(size / 16);
	const fontSizeRem = $derived((Math.round(size * 0.56) / 16));
	const iconWRem = $derived((Math.round(size * 0.42) / 16));
	const iconHRem = $derived((Math.round(Math.round(size * 0.42) * (20 / 16)) / 16));
	const hasPicture = $derived(Boolean(pictureUrl && String(pictureUrl).trim()));
</script>

<div
	class="profile-pic"
	class:bare
	style:width="{rem}rem"
	style:height="{rem}rem"
	aria-hidden="true"
>
	<div class="inner" style:background={bg} style:color={text} style:font-size="{fontSizeRem}rem">
		{#if hasPicture}
			<img class="photo" src={pictureUrl} alt="" />
		{:else if initial}
			{initial}
		{:else}
			<!-- Zapstore person glyph (head + shoulders) -->
			<svg
				class="user-icon"
				style:width="{iconWRem}rem"
				style:height="{iconHRem}rem"
				viewBox="0 0 16 20"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					d="M16 16.2353C16 18.3145 12.4183 20 8 20C3.58172 20 0 18.3145 0 16.2353C0 14.1561 3.58172 12.4706 8 12.4706C12.4183 12.4706 16 14.1561 16 16.2353Z"
				/>
				<path
					d="M12.8 4.70588C12.8 7.30487 10.651 9.41177 8 9.41177C5.34903 9.41177 3.2 7.30487 3.2 4.70588C3.2 2.1069 5.34903 0 8 0C10.651 0 12.8 2.1069 12.8 4.70588Z"
				/>
			</svg>
		{/if}
	</div>
</div>

<style>
	.profile-pic {
		flex-shrink: 0;
		border-radius: 50%;
	}

	.inner {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 0.33px solid var(--white16);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		line-height: 1;
		overflow: hidden;
		user-select: none;
	}

	.profile-pic.bare .inner {
		border: 0;
	}

	.photo {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.user-icon {
		flex-shrink: 0;
		opacity: 0.85;
	}
</style>
