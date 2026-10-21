<script>
	/**
	 * Circular profile pic — initial when named, Zapstore-style person icon when empty.
	 */
	import { stringToColor, profileTextColor } from '$lib/color.js';
	import { themeChoice } from '$lib/theme.svelte.js';

	let { name = '', size = 24, pictureUrl = /** @type {string | null} */ (null) } = $props();

	const initial = $derived(name?.trim()?.[0]?.toUpperCase() ?? '');
	const color = $derived(stringToColor(name?.trim() || 'A'));
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
	const fontSize = $derived(Math.round(size * 0.56));
	const iconW = $derived(Math.round(size * 0.42));
	const hasPicture = $derived(Boolean(pictureUrl && String(pictureUrl).trim()));
</script>

<div
	class="profile-pic"
	style:width="{size}px"
	style:height="{size}px"
	aria-hidden="true"
>
	<div class="inner" style:background={bg} style:color={text} style:font-size="{fontSize}px">
		{#if hasPicture}
			<img class="photo" src={pictureUrl} alt="" />
		{:else if initial}
			{initial}
		{:else}
			<!-- Zapstore person glyph (head + shoulders) -->
			<svg
				class="user-icon"
				width={iconW}
				height={Math.round(iconW * (20 / 16))}
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
