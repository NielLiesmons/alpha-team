<svelte:head><title>Chat</title></svelte:head>

<div class="empty">
	<img src="/emoji/chat.png" alt="" width="48" height="48" />
	<h1>Chat</h1>
	<p>Conversations for this space will live here.</p>
</div>

<style>
	.empty {
		min-height: 70%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 8px;
		padding: 8px 4px 40px;
	}

	h1 {
		font-size: 22px;
		font-weight: 650;
		letter-spacing: -0.03em;
	}

	p {
		color: var(--white66);
		font-size: 15px;
	}

	img {
		border-radius: 10px;
	}
</style>
