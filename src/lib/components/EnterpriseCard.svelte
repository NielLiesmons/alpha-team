<script>
	/**
	 * Feed row: EnterpriseBox | title
	 * Row 2: pills aligned with title (Planning + new activity)
	 */
	import { goto } from '$app/navigation';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import ProfilePic from './ProfilePic.svelte';

	let {
		id = '',
		title = '',
		status = 'active',
		icon = /** @type {string | null} */ (null),
		newCount = 0,
		assignees = /** @type {{ email?: string, name?: string }[]} */ ([]),
		selected = false,
		onclick = () => {}
	} = $props();

	/** @param {MouseEvent} e */
	function openPlanning(e) {
		e.stopPropagation();
		e.preventDefault();
		goto('/planning');
	}

	/** @param {MouseEvent} e */
	function openNew(e) {
		e.stopPropagation();
		e.preventDefault();
		onclick();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role a11y_click_events_have_key_events -->
<article
	class="enterprise-card"
	class:selected
	role="button"
	tabindex="0"
	aria-current={selected ? 'true' : undefined}
	{onclick}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onclick())}
>
	<div class="row-main">
		<div class="box-col">
			<EnterpriseBox state={status} {icon} size={24} />
		</div>
		<span class="title" class:done={status === 'closed'}>{title}</span>
	</div>

	<div class="pill-row">
		<button type="button" class="card-pill planning" onclick={openPlanning}>
			{#if assignees.length > 0}
				<span class="pill-pfps">
					{#each assignees.slice(0, 3) as a, i (a.email ?? a.name ?? i)}
						<span class="pill-pfp" style:z-index={3 - i}>
							<ProfilePic name={a.name ?? ''} size={14} />
						</span>
					{/each}
				</span>
			{/if}
			<span>Planning</span>
		</button>
		{#if newCount > 0}
			<button type="button" class="card-pill new" onclick={openNew} aria-label="{newCount} new items">
				{newCount} new
			</button>
		{/if}
	</div>
</article>

<style>
	.enterprise-card {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 12px 12px 10px;
		border: 0;
		background: transparent;
		border-radius: 12px;
		cursor: pointer;
		outline: none;
	}

	.enterprise-card:hover {
		background: var(--fg-4);
	}

	.enterprise-card:focus-visible {
		background: var(--fg-4);
	}

	.enterprise-card.selected {
		background: var(--fg-4);
	}

	.row-main {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 24px;
	}

	.box-col {
		width: 24px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.title {
		flex: 1;
		min-width: 0;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--white);
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.title.done {
		color: var(--white66);
	}

	.pill-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 8px 0 0;
		margin-left: 36px;
		min-width: 0;
	}

	.card-pill {
		height: 22px;
		padding: 0 10px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 11px;
		font-weight: 550;
		letter-spacing: 0.01em;
		cursor: pointer;
		white-space: nowrap;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.card-pill.planning {
		padding-left: 8px;
	}

	.card-pill:hover {
		background: var(--fg-11);
		color: var(--fg);
	}

	.card-pill.new {
		background: color-mix(in srgb, var(--accent-2) 18%, transparent);
		color: var(--accent-2);
	}

	.card-pill.new:hover {
		background: color-mix(in srgb, var(--accent-2) 28%, transparent);
	}

	.pill-pfps {
		display: flex;
		align-items: center;
	}

	.pill-pfp {
		display: flex;
		margin-left: -4px;
	}

	.pill-pfp:first-child {
		margin-left: 0;
	}
</style>
