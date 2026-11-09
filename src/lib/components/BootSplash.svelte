<script>
	import { t } from '$lib/i18n.svelte.js';
</script>

<main class="splash" aria-busy="true" aria-label={t('common.loading')}>
	<div class="dot"></div>
</main>

<style>
	.splash {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		background: var(--shell);
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: var(--white33);
		animation: pulse 1s var(--ease, ease) infinite alternate;
	}

	@keyframes pulse {
		from {
			opacity: 0.35;
			transform: scale(0.85);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
