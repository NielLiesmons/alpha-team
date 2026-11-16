<script>
	import { t } from '$lib/i18n.svelte.js';
</script>

<svelte:head><title>{t('nav.shop')}</title></svelte:head>

<div class="feed">
	<p class="hint">{t('web.stubShop')}</p>
</div>

<style>
	.feed {
		display: flex;
		flex: 1;
		min-height: 0;
		align-items: center;
		justify-content: center;
		padding: var(--feed-pad-top, 48px) 16px var(--feed-pad-bottom, 40px);
		box-sizing: border-box;
	}

	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
		max-width: 28ch;
	}
</style>
