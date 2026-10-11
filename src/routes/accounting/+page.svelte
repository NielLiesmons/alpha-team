<svelte:head><title>Accounting</title></svelte:head>

<div class="empty">
	<span class="slot"></span>
	<h1>Accounting</h1>
	<p>Books and invoices will live here. The emoji slot stays empty until there is a sticker for it.</p>
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

	.slot {
		width: 48px;
		height: 48px;
		border-radius: 12px;
		background: var(--white8);
	}

	h1 {
		font-size: 22px;
		font-weight: 650;
		letter-spacing: -0.03em;
	}

	p {
		color: var(--white66);
		font-size: 15px;
		max-width: 360px;
	}
</style>
