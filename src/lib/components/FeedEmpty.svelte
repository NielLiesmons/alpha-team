<script>
	/**
	 * Canonical feed / list empty — match Mail + Chat:
	 * large centered title (~1.65rem / --fg-33) + quiet body (14px / --fg-16).
	 * Never include a CTA; create flows live elsewhere in chrome.
	 *
	 * @type {{ title: string, body?: string }}
	 */
	let { title, body = '' } = $props();
</script>

<div class="empty" role="status">
	<p class="empty-title">{title}</p>
	{#if body}
		<p class="empty-body">{body}</p>
	{/if}
</div>

<style>
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin: auto;
		padding: 2rem 1.5rem;
		text-align: center;
		box-sizing: border-box;
		min-height: 12rem;
	}

	.empty-title {
		margin: 0;
		font-family: var(--font);
		font-size: 1.65rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--fg-33);
	}

	.empty-body {
		margin: 0.55rem 0 0;
		max-width: 16rem;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--fg-16);
	}
</style>
