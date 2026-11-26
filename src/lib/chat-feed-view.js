/**
 * Identity-preserving channel feed view (chronological + feedBlocks + stack).
 *
 * Send used to rebuild every block object on each chatFeed.unshift, forcing
 * Svelte to reconcile ~300+ keyed rows on the critical path. Fast paths keep
 * prior block object identities so only the tip row mounts.
 */

import { continuesChatStack } from './chat-stack.js';

/**
 * @typedef {{
 *   type: 'panel' | 'plain' | 'status',
 *   key: string,
 *   refKey?: string | null,
 *   refMeta?: any,
 *   messages: any[]
 * }} FeedBlock
 *
 * @typedef {{
 *   channelId: string,
 *   chrono: any[],
 *   blocks: FeedBlock[],
 *   stack: Map<string, { isFirst: boolean, isLast: boolean }>
 * }} ChannelFeedView
 */

/**
 * @returns {ChannelFeedView}
 */
export function createChannelFeedView() {
	return {
		channelId: '',
		chrono: [],
		blocks: [],
		stack: new Map()
	};
}

/**
 * @param {any[]} feed newest-first
 * @param {string} channelId
 * @param {string | null | undefined} holdId local id excluded until after paint
 * @returns {any[]} oldest → newest
 */
export function collectChannelChronological(feed, channelId, holdId = null) {
	const len = feed?.length || 0;
	/** @type {any[]} */
	const out = [];
	for (let i = len - 1; i >= 0; i--) {
		const m = feed[i];
		if (!m || m.kind === 'reaction') continue;
		if ((m.channel_id || 'general') !== channelId) continue;
		if (holdId && m.id === holdId) continue;
		out.push(m);
	}
	return out;
}

/**
 * @param {any[]} chronological
 * @param {{
 *   isChatStatusEvent: (msg: any) => boolean,
 *   chatPublicationRefKey: (msg: any) => string | null,
 *   chatRefMeta: (msg: any) => any
 * }} api
 * @returns {FeedBlock[]}
 */
export function buildFeedBlocks(chronological, api) {
	/** @type {FeedBlock[]} */
	const blocks = [];
	for (const msg of chronological) {
		if (api.isChatStatusEvent(msg)) {
			blocks.push({
				type: 'status',
				key: `status-${msg.id}`,
				messages: [msg]
			});
			continue;
		}
		const refKey = api.chatPublicationRefKey(msg);
		const last = blocks[blocks.length - 1];
		if (refKey && last?.type === 'panel' && last.refKey === refKey) {
			last.messages.push(msg);
			continue;
		}
		if (refKey) {
			blocks.push({
				type: 'panel',
				key: `panel-${refKey}-${msg.id}`,
				refKey,
				refMeta: api.chatRefMeta(msg),
				messages: [msg]
			});
		} else {
			blocks.push({
				type: 'plain',
				key: `msg-${msg.id}`,
				messages: [msg]
			});
		}
	}
	return blocks;
}

/**
 * @param {ChannelFeedView} view
 * @param {any} msg
 * @param {string} meEmail
 * @param {{
 *   isChatStatusEvent: (msg: any) => boolean,
 *   chatPublicationRefKey: (msg: any) => string | null,
 *   chatRefMeta: (msg: any) => any
 * }} api
 */
function appendTip(view, msg, meEmail, api) {
	const chrono = view.chrono;
	const prev = chrono.length ? chrono[chrono.length - 1] : null;
	const older = chrono.length > 1 ? chrono[chrono.length - 2] : null;
	view.chrono = chrono.concat(msg);

	const stack = new Map(view.stack);
	if (prev) {
		const prevId = String(prev.id);
		stack.set(prevId, {
			isFirst: !older || !continuesChatStack(older, prev, meEmail),
			isLast: !continuesChatStack(prev, msg, meEmail)
		});
	}
	stack.set(String(msg.id), {
		isFirst: !prev || !continuesChatStack(prev, msg, meEmail),
		isLast: true
	});
	view.stack = stack;

	const blocks = view.blocks.slice();
	if (api.isChatStatusEvent(msg)) {
		blocks.push({
			type: 'status',
			key: `status-${msg.id}`,
			messages: [msg]
		});
	} else {
		const refKey = api.chatPublicationRefKey(msg);
		const last = blocks[blocks.length - 1];
		if (refKey && last?.type === 'panel' && last.refKey === refKey) {
			blocks[blocks.length - 1] = {
				...last,
				messages: last.messages.concat(msg)
			};
		} else if (refKey) {
			blocks.push({
				type: 'panel',
				key: `panel-${refKey}-${msg.id}`,
				refKey,
				refMeta: api.chatRefMeta(msg),
				messages: [msg]
			});
		} else {
			blocks.push({
				type: 'plain',
				key: `msg-${msg.id}`,
				messages: [msg]
			});
		}
	}
	view.blocks = blocks;
}

/**
 * Same id sequence, replaced message objects (soft-delete / delivery settle).
 * @param {ChannelFeedView} view
 * @param {any[]} visible
 * @param {{
 *   isChatStatusEvent: (msg: any) => boolean,
 *   chatPublicationRefKey: (msg: any) => string | null,
 *   chatRefMeta: (msg: any) => any
 * }} api
 */
function patchMessageRefs(view, visible, api) {
	view.chrono = visible.slice();
	let vi = 0;
	let dirty = false;
	const nextBlocks = view.blocks.map((block) => {
		/** @type {any[]} */
		const msgs = [];
		let changed = false;
		for (let j = 0; j < block.messages.length; j++) {
			const next = visible[vi++];
			msgs.push(next);
			if (next !== block.messages[j]) changed = true;
		}
		if (!changed) return block;
		dirty = true;
		if (block.type === 'panel') {
			return {
				...block,
				messages: msgs,
				refMeta: api.chatRefMeta(msgs[0])
			};
		}
		return { ...block, messages: msgs };
	});
	if (dirty) view.blocks = nextBlocks;
}

/**
 * @param {ChannelFeedView} view
 * @param {{
 *   isChatStatusEvent: (msg: any) => boolean,
 *   chatPublicationRefKey: (msg: any) => string | null,
 *   chatRefMeta: (msg: any) => any
 * }} api
 * @returns {boolean} whether any panel meta object was replaced
 */
function refreshPanelMeta(view, api) {
	let dirty = false;
	const next = view.blocks.map((block) => {
		if (block.type !== 'panel' || !block.messages[0]) return block;
		const refMeta = api.chatRefMeta(block.messages[0]);
		const prev = block.refMeta;
		if (
			(refMeta?.title || '') === (prev?.title || '') &&
			Boolean(refMeta?.deleted) === Boolean(prev?.deleted) &&
			Boolean(refMeta?.loading) === Boolean(prev?.loading) &&
			String(refMeta?.status || '') === String(prev?.status || '')
		) {
			return block;
		}
		dirty = true;
		return { ...block, refMeta };
	});
	if (dirty) view.blocks = next;
	return dirty;
}

/**
 * @param {ChannelFeedView} view
 * @param {any[]} visible
 * @param {string} channelId
 * @param {string} meEmail
 * @param {{
 *   isChatStatusEvent: (msg: any) => boolean,
 *   chatPublicationRefKey: (msg: any) => string | null,
 *   chatRefMeta: (msg: any) => any,
 *   chatStackFlags: (chrono: any[], me: string) => Map<string, { isFirst: boolean, isLast: boolean }>
 * }} api
 */
function fullRebuild(view, visible, channelId, meEmail, api) {
	view.channelId = channelId;
	view.chrono = visible;
	view.blocks = buildFeedBlocks(visible, api);
	view.stack = api.chatStackFlags(visible, meEmail);
}

/**
 * Sync view to feed. Preserves block identities on tip-append / no-op / meta-only.
 *
 * @param {ChannelFeedView} view
 * @param {any[]} feed
 * @param {string} channelId
 * @param {string} meEmail
 * @param {string | null | undefined} holdId
 * @param {{
 *   isChatStatusEvent: (msg: any) => boolean,
 *   chatPublicationRefKey: (msg: any) => string | null,
 *   chatRefMeta: (msg: any) => any,
 *   chatStackFlags: (chrono: any[], me: string) => Map<string, { isFirst: boolean, isLast: boolean }>
 * }} api
 * @returns {{ chronological: any[], feedBlocks: FeedBlock[], stackMap: Map<string, { isFirst: boolean, isLast: boolean }> }}
 */
export function syncChannelFeedView(view, feed, channelId, meEmail, holdId, api) {
	const visible = collectChannelChronological(feed, channelId, holdId);

	if (view.channelId !== channelId) {
		fullRebuild(view, visible, channelId, meEmail, api);
		return {
			chronological: view.chrono,
			feedBlocks: view.blocks,
			stackMap: view.stack
		};
	}

	const prev = view.chrono;
	if (visible.length === prev.length) {
		let idsMatch = true;
		let refsMatch = true;
		for (let i = 0; i < visible.length; i++) {
			if (String(visible[i]?.id) !== String(prev[i]?.id)) {
				idsMatch = false;
				break;
			}
			if (visible[i] !== prev[i]) refsMatch = false;
		}
		if (idsMatch) {
			if (!refsMatch) patchMessageRefs(view, visible, api);
			refreshPanelMeta(view, api);
			return {
				chronological: view.chrono,
				feedBlocks: view.blocks,
				stackMap: view.stack
			};
		}
	}

	if (visible.length === prev.length + 1) {
		let prefixOk = true;
		for (let i = 0; i < prev.length; i++) {
			if (String(visible[i]?.id) !== String(prev[i]?.id) || visible[i] !== prev[i]) {
				prefixOk = false;
				break;
			}
		}
		if (prefixOk) {
			appendTip(view, visible[visible.length - 1], meEmail, api);
			return {
				chronological: view.chrono,
				feedBlocks: view.blocks,
				stackMap: view.stack
			};
		}
	}

	if (prev.length === 0 && visible.length === 1) {
		appendTip(view, visible[0], meEmail, api);
		return {
			chronological: view.chrono,
			feedBlocks: view.blocks,
			stackMap: view.stack
		};
	}

	fullRebuild(view, visible, channelId, meEmail, api);
	return {
		chronological: view.chrono,
		feedBlocks: view.blocks,
		stackMap: view.stack
	};
}
