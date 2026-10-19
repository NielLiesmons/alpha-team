<script>
	import ProfilePic from './ProfilePic.svelte';
	import Spinner from './Spinner.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		chatUi,
		commentsByKey,
		loadComments,
		postChatMessage
	} from '$lib/chat.svelte.js';
	import { activeSession } from '$lib/drive/session.svelte.js';

	/** @type {{ type: 'task' | 'note' | 'project', entityId: string }} */
	let { type, entityId } = $props();

	let draft = $state('');
	let loading = $state(false);
	/** @type {string | null} */
	let error = $state(null);

	const key = $derived(`${type}:${entityId}`);
	const messages = $derived(commentsByKey[key] ?? []);

	$effect(() => {
		const t = type;
		const id = entityId;
		if (!id) return;
		loading = true;
		error = null;
		loadComments(t, id)
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				loading = false;
			});
	});

	function formatWhen(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function send() {
		const body = draft.trim();
		if (!body || chatUi.posting) return;
		error = null;
		try {
			await postChatMessage({
				body,
				kind: 'comment',
				ref: { type, id: entityId }
			});
			draft = '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}
</script>

<section class="thread">
	<div class="thread-head">
		<span class="eyebrow-label-xs">Comments</span>
		<span class="count">{messages.length}</span>
	</div>

	{#if loading && messages.length === 0}
		<p class="hint">Loading…</p>
	{:else if messages.length === 0}
		<p class="hint">No comments yet — start the thread.</p>
	{:else}
		<ul class="list">
			{#each messages as msg (msg.id)}
				{@const person = asPerson(msg.author)}
				<li class="row">
					<ProfilePic name={person?.name || displayNameFromEmail(msg.author)} size={28} />
					<div class="bubble">
						<div class="meta">
							<span class="name">{person?.name || displayNameFromEmail(msg.author)}</span>
							<span class="when">{formatWhen(msg.created_at)}</span>
						</div>
						<p class="body">{msg.body}</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if error}
		<p class="err">{error}</p>
	{/if}

	<div class="composer">
		<textarea
			class="input"
			rows="2"
			placeholder={activeSession() ? 'Write a comment…' : 'Connect Drive to comment'}
			bind:value={draft}
			onkeydown={onKey}
		></textarea>
		<button
			type="button"
			class="send"
			disabled={!draft.trim() || chatUi.posting}
			onclick={() => void send()}
		>
			{#if chatUi.posting}<Spinner size={14} label="Sending" />{:else}Send{/if}
		</button>
	</div>
</section>

<style>
	.thread {
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid var(--fg-8);
	}

	.thread-head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}

	.count {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.hint {
		margin: 0 0 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

	.list {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.row {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}

	.bubble {
		flex: 1;
		min-width: 0;
	}

	.meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 2px;
	}

	.name {
		font-size: 13px;
		font-weight: 600;
		color: var(--fg);
	}

	.when {
		font-size: 11px;
		color: var(--fg-33);
	}

	.body {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--fg-66);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.err {
		margin: 0 0 8px;
		font-size: 13px;
		color: #b44;
	}

	.composer {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.input {
		width: 100%;
		min-height: 56px;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		resize: vertical;
	}

	.input:focus {
		outline: 2px solid var(--fg-8);
		outline-offset: 0;
	}

	.send {
		align-self: flex-end;
		height: 36px;
		padding: 0 16px;
		border: 1px solid transparent;
		border-radius: 9999px;
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.send:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
