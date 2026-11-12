/**
 * Content-type frame host (`alpha.frame/1`).
 * Sandboxed iframe + postMessage bridge. Chat feed never loads package JS.
 */

/** @typedef {'getIdentity' | 'getEntity' | 'putEntity' | 'sendActivity' | 'attachBlob' | 'close'} FrameMethod */

export const FRAME_BRIDGE = 'alpha.frame/1';

/**
 * @typedef {{
 *   email: string,
 *   name: string
 * }} FrameIdentity
 *
 * @typedef {{
 *   getIdentity: () => FrameIdentity | Promise<FrameIdentity>,
 *   getEntity: () => any | Promise<any>,
 *   putEntity?: (patch: any) => any | Promise<any>,
 *   sendActivity?: (update: { kind?: string, info?: string, summary?: string }) => void | Promise<void>,
 *   attachBlob?: (file: File) => { path: string } | Promise<{ path: string }>,
 *   onClose?: () => void
 * }} FrameHostHandlers
 */

/**
 * Build a blob: URL for HTML that bootstraps window.alphaFrame via parent postMessage.
 * Package app HTML should be embedded or linked; for v0 we wrap raw HTML source.
 * @param {string} appHtml
 * @param {{ packageId: string, entitySchema: string }} meta
 */
export function wrapFrameDocument(appHtml, meta) {
	const boot = `<script>
(function () {
  var BRIDGE = ${JSON.stringify(FRAME_BRIDGE)};
  var pending = Object.create(null);
  var seq = 0;
  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ bridge: BRIDGE, id: id, method: method, params: params || null }, '*');
    });
  }
  window.alphaFrame = {
    bridge: BRIDGE,
    packageId: ${JSON.stringify(meta.packageId)},
    entitySchema: ${JSON.stringify(meta.entitySchema)},
    getIdentity: function () { return call('getIdentity'); },
    getEntity: function () { return call('getEntity'); },
    putEntity: function (patch) { return call('putEntity', patch); },
    sendActivity: function (update) { return call('sendActivity', update); },
    attachBlob: function () { return Promise.reject(new Error('attachBlob: use host file picker')); },
    close: function () { return call('close'); }
  };
  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.bridge !== BRIDGE || data.id == null) return;
    var p = pending[data.id];
    if (!p) return;
    delete pending[data.id];
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data.result);
  });
})();
</script>`;
	// Inject bridge before </head> or at start of document.
	if (/<\/head>/i.test(appHtml)) {
		return appHtml.replace(/<\/head>/i, `${boot}</head>`);
	}
	return `<!doctype html><html><head>${boot}</head><body>${appHtml}</body></html>`;
}

/**
 * Attach postMessage listener for one frame window.
 * @param {Window} frameWindow
 * @param {FrameHostHandlers} handlers
 * @returns {() => void} unsubscribe
 */
export function bindFrameHost(frameWindow, handlers) {
	/**
	 * @param {MessageEvent} ev
	 */
	async function onMessage(ev) {
		if (ev.source !== frameWindow) return;
		const data = ev.data;
		if (!data || data.bridge !== FRAME_BRIDGE || data.id == null) return;
		const method = /** @type {FrameMethod} */ (data.method);
		try {
			let result = null;
			if (method === 'getIdentity') result = await handlers.getIdentity();
			else if (method === 'getEntity') result = await handlers.getEntity();
			else if (method === 'putEntity') {
				if (!handlers.putEntity) throw new Error('putEntity not allowed');
				result = await handlers.putEntity(data.params);
			} else if (method === 'sendActivity') {
				if (handlers.sendActivity) await handlers.sendActivity(data.params || {});
				result = { ok: true };
			} else if (method === 'close') {
				handlers.onClose?.();
				result = { ok: true };
			} else {
				throw new Error(`Unknown method ${method}`);
			}
			frameWindow.postMessage(
				{ bridge: FRAME_BRIDGE, id: data.id, result },
				'*'
			);
		} catch (e) {
			frameWindow.postMessage(
				{
					bridge: FRAME_BRIDGE,
					id: data.id,
					error: e instanceof Error ? e.message : String(e)
				},
				'*'
			);
		}
	}
	window.addEventListener('message', onMessage);
	return () => window.removeEventListener('message', onMessage);
}

/**
 * Sandbox attribute for content-type frames.
 * No same-origin, no top-nav; scripts allowed inside the blob doc only.
 */
export const FRAME_SANDBOX =
	'allow-scripts allow-forms allow-downloads allow-modals allow-popups-to-escape-sandbox';
