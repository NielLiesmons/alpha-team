<script>
	/**
	 * Centered system/status line (chat + mail threads).
	 * Optional quiet pfp when the line involves an account.
	 */
	import ProfilePic from './ProfilePic.svelte';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';

	/**
	 * @type {{
	 *   text: string,
	 *   email?: string,
	 *   name?: string,
	 *   emails?: string[]
	 * }}
	 */
	let { text = '', email = '', name = '', emails = [] } = $props();

	const people = $derived.by(() => {
		/** @type {{ email: string, name: string }[]} */
		const out = [];
		const seen = new Set();
		const push = (/** @type {string} */ e, /** @type {string} */ n) => {
			const key = String(e || '')
				.trim()
				.toLowerCase();
			if (!key || seen.has(key)) return;
			seen.add(key);
			out.push({
				email: key,
				name: n || displayNameFromEmail(key)
			});
		};
		if (email) push(email, name);
		for (const e of emails || []) push(e, '');
		return out.slice(0, 3);
	});
</script>

{#if text}
	<div class="status-line">
		{#if people.length}
			<span class="status-pfps" aria-hidden="true">
				{#each people as p, i (p.email)}
					<span class="status-pfp" style:z-index={people.length - i}>
						<ProfilePic
							name={p.name}
							email={p.email}
							pictureUrl={pictureUrlFor(p.email)}
							size={16}
							bare
						/>
					</span>
				{/each}
			</span>
		{/if}
		<span class="status-text">{text}</span>
	</div>
{/if}

<style>
	.status-line {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 8px 16px;
		box-sizing: border-box;
	}

	.status-pfps {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		opacity: 0.66;
	}

	.status-pfp {
		display: grid;
		place-items: center;
		margin-left: -4px;
		border-radius: 999px;
	}

	.status-pfp:first-child {
		margin-left: 0;
	}

	.status-text {
		max-width: 28rem;
		font-size: 12px;
		font-weight: 500;
		line-height: 1.35;
		color: var(--fg-33);
		text-align: center;
	}
</style>
