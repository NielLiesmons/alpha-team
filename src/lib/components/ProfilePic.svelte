<script>
	import { stringToColor, profileTextColor } from '$lib/color.js';
	import { themeChoice } from '$lib/theme.svelte.js';

	let { name = '', size = 24 } = $props();

	const initial = $derived(name?.trim()?.[0]?.toUpperCase() ?? '');
	const color = $derived(stringToColor(name || 'A'));
	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});
	const text = $derived(profileTextColor(color, isDark));
	const bg = $derived(`rgba(${color.r}, ${color.g}, ${color.b}, 0.24)`);
	const fontSize = $derived(Math.round(size * 0.56));
</script>

<div
	class="profile-pic"
	style:width="{size}px"
	style:height="{size}px"
	aria-hidden="true"
>
	<div class="inner" style:background={bg} style:color={text} style:font-size="{fontSize}px">
		{#if initial}{initial}{/if}
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
</style>
