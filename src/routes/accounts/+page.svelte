<script>
	import DriveInvite from '$lib/components/DriveInvite.svelte';
	import { actor } from '$lib/actor.svelte.js';
	import { canManageMembers } from '$lib/members.svelte.js';

	const allowed = $derived(canManageMembers(actor.email));
</script>

<svelte:head>
	<title>Accounts</title>
</svelte:head>

<div class="feed accounts">
	{#if !allowed}
		<section class="block">
			<p class="field-label">Accounts</p>
			<p class="hint">
				Only owners and admins can manage family accounts. Switch to an admin profile on this
				device, or ask someone with an admin invite.
			</p>
		</section>
	{:else}
		<p class="intro">
			Invite people with a QR code, and manage who exists on the Drive. Profiles only appear on a
			phone after that invite is claimed.
		</p>
		<DriveInvite />
	{/if}
</div>

<style>
	.accounts {
		padding-left: 16px;
		padding-right: 16px;
		box-sizing: border-box;
	}

	.intro {
		max-width: 520px;
		margin: 0 0 1.25rem;
		font-size: 14px;
		line-height: 1.45;
		color: var(--white66);
	}

	.block {
		max-width: 520px;
		margin-bottom: 1.75rem;
	}

	.hint {
		margin: 0 0 0.85rem;
		font-size: 13px;
		color: var(--white66);
	}
</style>
