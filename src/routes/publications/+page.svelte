<script>
	/**
	 * Deep-link shim: Publications live in the Website detail column.
	 * Keep /website as the list pane; open pubs hub via selectEntity.
	 */
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { refreshPublications } from '$lib/publications.svelte.js';
	import { selectEntity } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	onMount(() => {
		void refreshPublications();
		void goto('/website', { replaceState: true }).then(() => {
			selectEntity('pubs', 'hub');
		});
	});
</script>

<svelte:head><title>{t('nav.publications')}</title></svelte:head>

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
