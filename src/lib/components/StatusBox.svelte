<script>
	/** @type {{ state?: string, size?: number }} */
	let { state = 'open', size = 24 } = $props();
</script>

<span class="box {state}" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span>

<style>
	.box {
		display: block;
		border-radius: 6px;
		box-sizing: border-box;
		flex-shrink: 0;
		border: 1.5px solid var(--white33);
		background: transparent;
	}

	.open {
		border-color: var(--blurpleColor);
	}

	.inProgress {
		border-color: var(--blurpleColor);
		background: var(--blurpleColor);
	}

	.closed {
		border-color: var(--white33);
		background: var(--white16);
	}

	.planned,
	.backlog {
		border-color: var(--white33);
		border-style: dashed;
	}
</style>
