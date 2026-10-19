<script>
	import { goto } from '$app/navigation';
	import { websiteChildren } from '$lib/sections.js';
	import NavIcon from '$lib/components/NavIcon.svelte';
</script>

<svelte:head><title>Website</title></svelte:head>

<nav class="feed" aria-label="Website">
	<div class="card-stack top">
		{#each websiteChildren as item (item.href)}
			<button type="button" class="row" onclick={() => goto(item.href)}>
				<span class="row-icon" aria-hidden="true">
					<NavIcon name={item.icon} size={16} />
				</span>
				<span class="title">{item.label}</span>
			</button>
		{/each}
	</div>
	<p class="hint">Content, shop catalog, and publications for the public site.</p>
</nav>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding-top: var(--feed-pad-top, 48px);
		padding-bottom: var(--feed-pad-bottom, 40px);
		box-sizing: border-box;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: calc(0.85rem - 4px) 0.9rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row-icon {
		display: grid;
		place-items: center;
		width: 22px;
		color: var(--fg-66);
		flex-shrink: 0;
	}

	.title {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
	}

	.hint {
		margin: 12px 16px 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
	}
</style>
