<script>
	import {
		dismissInstallCoach,
		promptInstall,
		pwaUi,
		shouldShowInstallCoach
	} from '$lib/pwa.svelte.js';

	let open = $state(false);

	$effect(() => {
		open = shouldShowInstallCoach();
	});

	function dismiss() {
		dismissInstallCoach();
		open = false;
	}

	async function install() {
		await promptInstall();
		if (pwaUi.standalone) open = false;
	}
</script>

{#if open}
	<aside class="coach" role="status">
		<div class="copy">
			{#if pwaUi.ios}
				<strong>Install Alpha on this iPhone</strong>
				<p>
					Tap <b>Share</b> → <b>Add to Home Screen</b>, then open the new icon. That unlocks
					notifications when Alpha is closed.
				</p>
			{:else if pwaUi.canInstall}
				<strong>Install Alpha</strong>
				<p>Add it to your home screen for push notifications and faster launches.</p>
			{:else}
				<strong>Install Alpha</strong>
				<p>Use your browser menu → Install app / Add to Home Screen for notifications offline.</p>
			{/if}
		</div>
		<div class="actions">
			{#if !pwaUi.ios && pwaUi.canInstall}
				<button type="button" class="btn" onclick={install}>Install</button>
			{/if}
			<button type="button" class="btn ghost" onclick={dismiss}>Not now</button>
		</div>
	</aside>
{/if}

<style>
	.coach {
		position: sticky;
		top: 0;
		z-index: 40;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem 1rem;
		margin: 0;
		padding: 0.85rem 1rem;
		padding-left: max(1rem, env(safe-area-inset-left));
		padding-right: max(1rem, env(safe-area-inset-right));
		background: color-mix(in srgb, var(--accent, #3d7ea6) 18%, var(--surface, #161616));
		border-bottom: 1px solid var(--white11);
		color: var(--white);
	}

	.copy {
		flex: 1 1 14rem;
		min-width: 0;
	}

	.copy strong {
		display: block;
		font-size: 14px;
		font-weight: 700;
		margin-bottom: 0.2rem;
	}

	.copy p {
		margin: 0;
		font-size: 13px;
		line-height: 1.35;
		color: var(--white66);
		font-weight: 500;
	}

	.copy b {
		color: var(--white);
		font-weight: 700;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.btn {
		height: 2rem;
		padding: 0 0.85rem;
		border-radius: 10px;
		border: none;
		background-image: var(--button-primary-bg);
		background-color: transparent;
		color: var(--whiteEnforced);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.btn.ghost {
		background-image: none;
		background: transparent;
		color: var(--white66);
		border: 1px solid var(--white11);
	}
</style>
