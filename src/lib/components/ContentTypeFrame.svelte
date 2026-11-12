<script>
	/**
	 * Sandboxed open-with frame for content-type packages (`alpha.frame/1`).
	 * Host chrome only — packages never style the chat feed.
	 */
	import { onDestroy } from 'svelte';
	import {
		FRAME_SANDBOX,
		bindFrameHost,
		wrapFrameDocument
	} from '$lib/content-types/frame-host.js';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';

	/**
	 * @type {{
	 *   packageId: string,
	 *   entitySchema: string,
	 *   appHtml: string,
	 *   entity: any,
	 *   onPutEntity?: ((patch: any) => any | Promise<any>) | null,
	 *   onActivity?: ((update: { kind?: string, info?: string, summary?: string }) => void | Promise<void>) | null,
	 *   onClose?: (() => void) | null
	 * }}
	 */
	let {
		packageId,
		entitySchema,
		appHtml,
		entity,
		onPutEntity = null,
		onActivity = null,
		onClose = null
	} = $props();

	/** @type {HTMLIFrameElement | null} */
	let iframeEl = $state(null);
	/** @type {string} */
	let src = $state('');
	/** @type {(() => void) | null} */
	let unbind = null;

	$effect(() => {
		const html = wrapFrameDocument(appHtml, { packageId, entitySchema });
		const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
		src = url;
		return () => URL.revokeObjectURL(url);
	});

	$effect(() => {
		const el = iframeEl;
		if (!el) return;
		const onLoad = () => {
			unbind?.();
			const win = el.contentWindow;
			if (!win) return;
			unbind = bindFrameHost(win, {
				getIdentity: () => ({
					email: actor.email || '',
					name: displayNameFromEmail(actor.email || '')
				}),
				getEntity: () => entity,
				putEntity: onPutEntity || undefined,
				sendActivity: onActivity || undefined,
				onClose: () => onClose?.()
			});
		};
		el.addEventListener('load', onLoad);
		return () => {
			el.removeEventListener('load', onLoad);
			unbind?.();
			unbind = null;
		};
	});

	onDestroy(() => {
		unbind?.();
		unbind = null;
	});
</script>

<div class="ct-frame-shell">
	<iframe
		bind:this={iframeEl}
		class="ct-frame"
		title={packageId}
		sandbox={FRAME_SANDBOX}
		referrerpolicy="no-referrer"
		src={src}
	></iframe>
</div>

<style>
	.ct-frame-shell {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		background: var(--bg);
	}
	.ct-frame {
		width: 100%;
		height: 100%;
		min-height: 280px;
		border: 0;
		background: var(--bg);
	}
</style>
