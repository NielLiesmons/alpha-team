<script>
	import LabelPill from './LabelPill.svelte';

	let { labels = [], maxDisplay = 3 } = $props();
	const displayed = $derived(labels.slice(0, maxDisplay));
</script>

<div class="label-stack">
	{#each displayed as text, i (text)}
		<div
			class="label-item"
			class:is-behind={i < displayed.length - 1}
			style:z-index={i + 1}
			style:margin-left={i > 0 ? '-10px' : '0'}
		>
			<LabelPill {text} size="small" />
		</div>
	{/each}
</div>

<style>
	.label-stack {
		display: flex;
		align-items: center;
	}

	.label-item {
		position: relative;
		flex-shrink: 0;
	}

	.label-item.is-behind {
		width: 50px;
		overflow: hidden;
		mask-image: linear-gradient(to right, black calc(100% - 25px), transparent calc(100% - 10px));
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 25px), transparent calc(100% - 10px));
	}
</style>
