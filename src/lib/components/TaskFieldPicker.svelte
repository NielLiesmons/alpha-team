<script>
	import FloatPanel from './FloatPanel.svelte';
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import { ensureMailTask, patchTask } from '$lib/workspace.svelte.js';

	const STATUSES = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'open', label: 'Open' },
		{ value: 'planned', label: 'Planned' },
		{ value: 'inProgress', label: 'In progress' },
		{ value: 'inReview', label: 'In review' },
		{ value: 'closed', label: 'Closed' },
		{ value: 'canceled', label: 'Canceled' }
	];

	const PRIORITIES = [
		{ value: 'none', label: 'None' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'urgent', label: 'Urgent' }
	];

	/**
	 * @type {{
	 *   taskId?: string,
	 *   field: 'status' | 'priority',
	 *   value: string,
	 *   size?: number,
	 *   align?: 'left' | 'right',
	 *   variant?: 'icon' | 'pill',
	 *   mailThread?: { id: string, subject?: string, body?: string, flagged?: boolean } | null
	 * }}
	 */
	let {
		taskId = '',
		field,
		value,
		size = 22,
		align = 'left',
		variant = 'icon',
		mailThread = null
	} = $props();

	let open = $state(false);
	let saving = $state(false);
	/** @type {HTMLButtonElement | undefined} */
	let hitBtn = $state();

	const options = $derived(field === 'status' ? STATUSES : PRIORITIES);
	const ariaLabel = $derived(field === 'status' ? 'Set task status' : 'Set task priority');
	const valueLabel = $derived(options.find((o) => o.value === value)?.label ?? value);
	const iconSize = $derived(variant === 'pill' ? 20 : size);
	const unset = $derived(!taskId && Boolean(mailThread?.id));
	const boxState = $derived(field === 'status' ? (unset ? 'empty' : value) : value);

	/**
	 * @param {MouseEvent} e
	 */
	function toggle(e) {
		e.stopPropagation();
		e.preventDefault();
		open = !open;
	}

	/**
	 * @param {MouseEvent} e
	 * @param {string} next
	 */
	async function pick(e, next) {
		e.stopPropagation();
		e.preventDefault();
		open = false;
		if (next === value && taskId) return;
		saving = true;
		try {
			if (taskId) {
				await patchTask(taskId, field === 'status' ? { status: next } : { priority: next });
			} else if (mailThread?.id) {
				await ensureMailTask(mailThread, field === 'status' ? { status: next } : { priority: next });
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}
</script>

<div class="picker" class:align-right={align === 'right'} class:pill={variant === 'pill'} class:unset>
	<button
		bind:this={hitBtn}
		type="button"
		class="hit"
		class:icon-hit={variant === 'icon'}
		class:pill-hit={variant === 'pill'}
		aria-label={ariaLabel}
		aria-expanded={open}
		disabled={saving}
		onclick={toggle}
	>
		{#if field === 'status'}
			<TaskBox state={boxState} size={iconSize} />
		{:else}
			<PriorityBox priority={unset ? 'none' : value} size={variant === 'pill' ? 18 : size} />
		{/if}
		{#if variant === 'pill'}
			<span class="pill-text">{valueLabel}</span>
		{/if}
	</button>
	<FloatPanel
		{open}
		anchor={hitBtn}
		placement="below"
		align={align === 'right' ? 'end' : 'start'}
		width={180}
		maxHeight={320}
		onclose={() => (open = false)}
	>
		<div class="float-list" role="listbox">
			{#each options as opt (opt.value)}
				<button
					type="button"
					class="option"
					class:active={value === opt.value && !unset}
					onclick={(e) => pick(e, opt.value)}
				>
					{#if field === 'status'}
						<TaskBox state={opt.value} size={18} />
					{:else}
						<PriorityBox priority={opt.value} size={18} />
					{/if}
					<span class="option-label">{opt.label}</span>
				</button>
			{/each}
		</div>
	</FloatPanel>
</div>

<style>
	.picker {
		position: relative;
		flex-shrink: 0;
	}

	.hit {
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		color: inherit;
	}

	.icon-hit {
		border-radius: 6px;
	}

	.icon-hit:hover {
		background: var(--fg-4);
	}

	/* Match DetailMetaPills .meta-pill — 32px like Publish / action buttons */
	.pill-hit {
		gap: 6px;
		height: 32px;
		padding: 0 12px 0 8px;
		border-radius: 9999px;
		background: var(--fg-4);
		box-sizing: border-box;
	}

	.pill-hit:hover {
		background: var(--fg-8);
	}

	.pill-text {
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-66);
		white-space: nowrap;
	}

	.hit:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.unset :global(.task-box),
	.unset :global(.priority-box) {
		opacity: 0.55;
	}

	.float-list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 4px 0;
	}

	.option {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		background: none;
		border: none;
		border-radius: 0;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.option:hover {
		background: var(--fg-4);
	}

	.option.active .option-label {
		color: var(--fg);
		font-weight: 600;
	}

	.option-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
	}
</style>
