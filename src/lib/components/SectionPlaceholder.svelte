<script>
	import EmojiSlot from './EmojiSlot.svelte';

	/** @type {{ title: string, body: string, emoji?: string | null }} */
	let { title, body, emoji = null } = $props();
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="placeholder">
	<EmojiSlot src={emoji} size={72} />
	<h1>{title}</h1>
	<p>{body}</p>
</div>

<style>
	.placeholder {
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 12px;
		max-width: 420px;
	}

	h1 {
		font-size: 28px;
		font-weight: 650;
		letter-spacing: -0.03em;
	}

	p {
		color: var(--white66);
		font-size: 16px;
	}
</style>
