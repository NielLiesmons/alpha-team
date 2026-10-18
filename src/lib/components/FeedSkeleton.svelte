<script>
	import SkeletonLoader from './SkeletonLoader.svelte';

	/** @type {{ rows?: number, withArt?: boolean }} */
	let { rows = 8, withArt = false } = $props();
</script>

<div class="feed-skel" aria-busy="true" aria-label="Loading">
	{#each Array(rows) as _, i (i)}
		<div class="row" class:art={withArt}>
			{#if withArt}
				<span class="thumb"><SkeletonLoader /></span>
			{/if}
			<span class="lines">
				<span class="line primary" style="width: {62 - (i % 4) * 8}%"><SkeletonLoader /></span>
				<span class="line secondary" style="width: {44 - (i % 3) * 6}%"><SkeletonLoader /></span>
			</span>
		</div>
	{/each}
</div>

<style>
	.feed-skel {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 8px 16px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0.55rem 0.65rem;
		border-radius: 12px;
		box-sizing: border-box;
	}

	.thumb {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		overflow: hidden;
	}

	.lines {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.line {
		display: block;
		height: 11px;
		border-radius: 6px;
		overflow: hidden;
		max-width: 100%;
	}

	.line.primary {
		height: 13px;
	}

	.line.secondary {
		opacity: 0.85;
	}
</style>
