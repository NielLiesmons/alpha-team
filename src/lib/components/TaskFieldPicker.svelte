<script>
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import { patchTask } from '$lib/workspace.svelte.js';

	const STATUSES = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'open', label: 'Open' },
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

	/** @type {{ taskId: string, field: 'status' | 'priority', value: string, size?: number, align?: 'left' | 'right', variant?: 'icon' | 'pill' }} */
	let {
		taskId,
		field,
		value,
		size = 22,
		align = 'left',
		variant = 'icon'
	} = $props();

	let open = $state(false);
	let saving = $state(false);

	const options = $derived(field === 'status' ? STATUSES : PRIORITIES);
	const ariaLabel = $derived(field === 'status' ? 'Set task status' : 'Set task priority');
	const valueLabel = $derived(options.find((o) => o.value === value)?.label ?? value);
	const iconSize = $derived(variant === 'pill' ? 16 : size);

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
		if (next === value || !taskId) return;
		saving = true;
		try {
			await patchTask(taskId, field === 'status' ? { status: next } : { priority: next });
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	/**
	 * @param {MouseEvent} e
	 */
	function close(e) {
		e.stopPropagation();
		open = false;
	}
</script>

<div class="picker" class:align-right={align === 'right'} class:pill={variant === 'pill'}>
	<button
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
			<TaskBox state={value} size={iconSize} embedded={variant === 'pill'} />
		{:else}
			<PriorityBox priority={value} size={iconSize} />
		{/if}
		{#if variant === 'pill'}
			<span class="pill-text">{valueLabel}</span>
		{/if}
	</button>
	{#if open}
		<button type="button" class="menu-backdrop" aria-label="Close menu" onclick={close}></button>
		<div class="menu" class:menu-right={align === 'right'} role="listbox">
			{#each options as opt (opt.value)}
				<button
					type="button"
					class="option"
					class:active={value === opt.value}
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
	{/if}
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

	.pill-hit {
		gap: 6px;
		height: 28px;
		padding: 0 10px 0 7px;
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

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 19;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}

	.menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		overflow: hidden;
		min-width: 168px;
		box-shadow: 0 8px 28px color-mix(in srgb, var(--fg-raw) 18%, transparent);
	}

	.menu-right {
		left: auto;
		right: 0;
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
	}

	.option:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.option:hover {
		background: var(--fg-4);
	}

	.option-label {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--fg-66);
	}

	.option.active .option-label {
		color: var(--fg);
		font-weight: 600;
	}
</style>
