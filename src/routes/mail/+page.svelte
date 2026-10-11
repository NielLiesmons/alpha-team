<script>
	import { formatDate, seedSubscribers, statusLabel } from '$lib/fixtures.js';
	import { markSent, posts } from '$lib/preview.svelte.js';

	let confirmed = seedSubscribers.filter((person) => person.status === 'confirmed').length;
	let pending = seedSubscribers.filter((person) => person.status === 'pending').length;
	let lastSent = $derived(
		posts
			.filter((post) => post.sentAt)
			.sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0] ?? null
	);
</script>

<header class="page-head">
	<div>
		<h1>Mail</h1>
		<p>The same publication, sent to the list. Nothing is emailed from here.</p>
	</div>
</header>

<div class="stats">
	<div class="stat">
		<b>{confirmed}</b>
		<span>Confirmed</span>
	</div>
	<div class="stat">
		<b>{pending}</b>
		<span>Waiting to confirm</span>
	</div>
	<div class="stat">
		<b>{lastSent ? formatDate(lastSent.sentAt) : 'Aucun'}</b>
		<span>{lastSent ? lastSent.title : 'No send yet'}</span>
	</div>
</div>

<div class="stack">
	<div class="panel">
		<table class="data">
			<thead>
				<tr>
					<th>Publication</th>
					<th>Status</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each posts as post (post.id)}
					<tr>
						<td>
							<div>{post.title || 'Sans titre'}</div>
							<div class="muted">{formatDate(post.date)}</div>
						</td>
						<td><span class="pill {post.status}">{statusLabel[post.status]}</span></td>
						<td>
							{#if post.status === 'sent'}
								<span class="muted">Sent</span>
							{:else}
								<button
									type="button"
									class="btn primary small"
									disabled={post.status === 'draft'}
									onclick={() => markSent(post.id)}
								>
									Send
								</button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="panel">
		<table class="data">
			<thead>
				<tr>
					<th>Subscriber</th>
					<th>Email</th>
					<th>List</th>
				</tr>
			</thead>
			<tbody>
				{#each seedSubscribers as person (person.email)}
					<tr>
						<td>{person.name}</td>
						<td class="muted">{person.email}</td>
						<td>
							<span class="pill {person.status === 'pending' ? 'pending' : 'published'}">
								{person.status === 'pending' ? 'Waiting' : 'Confirmed'}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	td .muted {
		font-size: 13px;
		margin-top: 2px;
	}

	td:last-child {
		text-align: right;
	}
</style>
