<script>
	import CreateSheet from './CreateSheet.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { closeComposer, dataTables, enterprises, metrics, saveDataView, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	/** @type {string} */
	let enterpriseId = $state('');
	/** @type {string[]} */
	let tableIds = $state([]);
	/** @type {string[]} */
	let metricIds = $state([]);
	/** @type {string | null} */
	let seededFor = $state(null);

	const open = $derived(ui.composer?.kind === 'view');
	const tablesForEnt = $derived(
		enterpriseId
			? dataTables.filter((t) => t.enterprise_id === enterpriseId)
			: dataTables
	);
	const metricsForEnt = $derived(
		enterpriseId ? metrics.filter((m) => m.enterprise_id === enterpriseId) : metrics
	);

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		const seedKey = typeof ui.composer?.enterprise_id === 'string' ? ui.composer.enterprise_id : '';
		const stamp = `__new__:${seedKey}`;
		if (seededFor === stamp) return;
		seededFor = stamp;
		title = '';
		enterpriseId = seedKey;
		tableIds = [];
		metricIds = [];
	});

	/** @param {string} id */
	function toggleTable(id) {
		tableIds = tableIds.includes(id) ? tableIds.filter((x) => x !== id) : [...tableIds, id];
	}

	/** @param {string} id */
	function toggleMetric(id) {
		metricIds = metricIds.includes(id) ? metricIds.filter((x) => x !== id) : [...metricIds, id];
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		await saveDataView(
			{
				title: nextTitle,
				enterprise_id: enterpriseId || null,
				table_ids: tableIds,
				metric_ids: metricIds,
				description: ''
			},
			true
		);
		closeComposer();
	}
</script>

<CreateSheet {open} label="New view" onclose={closeComposer}>
	<input class="sheet-input" placeholder="View title" bind:value={title} />
	{#if enterprises.length}
		<select class="sheet-input" bind:value={enterpriseId}>
			<option value="">Enterprise (optional)</option>
			{#each enterprises as ent (ent.id)}
				<option value={ent.id}>{ent.title}</option>
			{/each}
		</select>
	{/if}
	{#if tablesForEnt.length}
		<p class="hint">Tables</p>
		<div class="checks">
			{#each tablesForEnt as t (t.id)}
				<label class="check">
					<input
						type="checkbox"
						checked={tableIds.includes(t.id)}
						onchange={() => toggleTable(t.id)}
					/>
					{t.title}
				</label>
			{/each}
		</div>
	{/if}
	{#if metricsForEnt.length}
		<p class="hint">Metrics</p>
		<div class="checks">
			{#each metricsForEnt as m (m.id)}
				<label class="check">
					<input
						type="checkbox"
						checked={metricIds.includes(m.id)}
						onchange={() => toggleMetric(m.id)}
					/>
					{m.title || m.key}
				</label>
			{/each}
		</div>
	{/if}
	<div class="sheet-bottom">
		<PrimaryButton size="sheet" disabled={!title.trim()} onclick={() => void save()}>Create</PrimaryButton>
	</div>
</CreateSheet>

<style>
	.hint {
		margin: 8px 0 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.checks {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 160px;
		overflow: auto;
		margin-bottom: 8px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--fg);
	}
</style>
