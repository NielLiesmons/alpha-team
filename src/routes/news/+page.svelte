<script>
	import { formatDate, statusLabel } from '$lib/fixtures.js';
	import { addPost, posts, publishPost } from '$lib/preview.svelte.js';

	let selectedId = $state(posts[0]?.id ?? '');
	let selected = $derived(posts.find((post) => post.id === selectedId) ?? null);

	function create() {
		selectedId = addPost();
	}
</script>

<header class="page-head">
	<div>
		<h1>News</h1>
		<p>One text, two outputs: the site, then the list.</p>
	</div>
	<div class="row-actions">
		<button type="button" class="btn ghost" onclick={create}>New</button>
	</div>
</header>

<div class="split">
	<div class="panel">
		{#each posts as post (post.id)}
			<button
				type="button"
				class="list-btn"
				class:selected={post.id === selectedId}
				onclick={() => (selectedId = post.id)}
			>
				<div class="list-title">
					<span>{post.title || 'Sans titre'}</span>
					<span class="pill {post.status}">{statusLabel[post.status]}</span>
				</div>
				<p class="list-meta">{formatDate(post.date)} · /{post.slug || '…'}</p>
			</button>
		{/each}
	</div>

	{#if selected}
		<form class="panel editor" onsubmit={(event) => event.preventDefault()}>
			<label class="field">
				<span>Titre</span>
				<input class="text" value={selected.title} oninput={(event) => (selected.title = event.currentTarget.value)} />
			</label>
			<label class="field">
				<span>Adresse</span>
				<input class="text" value={selected.slug} oninput={(event) => (selected.slug = event.currentTarget.value)} />
			</label>
			<div class="field">
				<span class="field-label">Status</span>
				<div class="segments" role="group" aria-label="Status">
					<span class="pill {selected.status}">{statusLabel[selected.status]}</span>
				</div>
			</div>
			<label class="field">
				<span>Texte</span>
				<textarea
					class="body"
					value={selected.body}
					oninput={(event) => (selected.body = event.currentTarget.value)}
				></textarea>
			</label>
			<div class="row-actions">
				<button type="button" class="btn primary" onclick={() => publishPost(selected.id)}>
					{selected.status === 'draft' ? 'Publish' : 'Back to draft'}
				</button>
			</div>
			{#if selected.status === 'sent'}
				<p class="muted">Already sent. Putting it back to draft does not recall the send, in this preview.</p>
			{/if}
		</form>
	{/if}
</div>

<style>
	form.editor .muted {
		margin-top: 12px;
		font-size: 13px;
	}
</style>
