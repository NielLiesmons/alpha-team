<script>
	/**
	 * Newsletter create/edit entry — opens the third-column PublicationEditor.
	 * New letters create a draft immediately; edits just select the entity.
	 */
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { persistCampaign } from '$lib/publications.svelte.js';
	import { closeComposer, selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let busy = $state(false);
	let err = $state('');
	/** @type {string | null} */
	let handled = $state(null);

	const open = $derived(ui.composer?.kind === 'newsletter');
	const composerKey = $derived(
		open ? `${ui.composer?.id || 'new'}:${ui.composer?.postSlug || ''}` : ''
	);

	$effect(() => {
		if (!open || !composerKey) {
			handled = null;
			return;
		}
		if (handled === composerKey || busy) return;
		handled = composerKey;
		void openEditor();
	});

	async function openEditor() {
		const id = ui.composer?.id ? String(ui.composer.id) : '';
		const seedSlug = ui.composer?.postSlug ? String(ui.composer.postSlug) : '';
		busy = true;
		err = '';
		try {
			if (id) {
				closeComposer();
				selectEntity('newsletter', id);
				return;
			}
			if (seedSlug) {
				closeComposer();
				selectEntity('newsletter', `post:${seedSlug}`);
				return;
			}
			const me = activePerson();
			const c = await persistCampaign({
				subject: t('pub.newLetter'),
				body: '<p></p>',
				publisher_email: me.email || undefined,
				publisher_name: me.name || displayNameFromEmail(me.email) || undefined
			});
			closeComposer();
			selectEntity('newsletter', c.id);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			handled = null;
		} finally {
			busy = false;
		}
	}
</script>

{#if open && err}
	<div class="err-toast" role="alert">
		{err}
		<button type="button" onclick={closeComposer}>{t('common.close')}</button>
	</div>
{/if}

<style>
	.err-toast {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 80;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--fg-8);
		color: var(--fg);
		font-size: 13px;
		box-shadow: var(--shadow-2, 0 8px 24px color-mix(in srgb, var(--ink) 16%, transparent));
	}

	.err-toast button {
		border: 0;
		background: transparent;
		font: inherit;
		font-weight: 650;
		color: var(--fg);
		cursor: pointer;
	}
</style>
