<script>
	/**
	 * Chat section = the single shared feed (was “General”).
	 * Mobile: this is the section page. Desktop: list column; entities open in detail.
	 */
	import ChatChannelPanel from '$lib/components/ChatChannelPanel.svelte';
	import { t } from '$lib/i18n.svelte.js';
</script>

<svelte:head><title>{t('nav.chat')}</title></svelte:head>

<div class="chat-section">
	<ChatChannelPanel channelId="general" />
</div>

<style>
	.chat-section {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
