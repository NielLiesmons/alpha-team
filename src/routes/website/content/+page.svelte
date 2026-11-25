<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { selectEntity } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	onMount(() => {
		void goto('/website', { replaceState: true }).then(() => {
			selectEntity('pubs', 'content');
		});
	});
</script>

<svelte:head><title>{t('nav.content')}</title></svelte:head>

<div class="feed">
	<p class="hint">{t('common.loading')}</p>
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
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
	}
</style>
