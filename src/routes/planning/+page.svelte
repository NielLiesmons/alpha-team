<script>
	import EnterpriseBox from '$lib/components/EnterpriseBox.svelte';
	import ProjectBox from '$lib/components/ProjectBox.svelte';
	import TaskBox from '$lib/components/TaskBox.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
	import {
		enterprises,
		openComposer,
		projects,
		selectEntity,
		tasks
	} from '$lib/workspace.svelte.js';

	/** @type {Set<string>} */
	let collapsed = $state(new Set());
	/** @type {Set<string>} */
	let collapsedProjects = $state(new Set());

	const DAY_MS = 86_400_000;
	const PX_PER_DAY = 6;

	const sortedEnterprises = $derived(
		[...enterprises].sort(
			(a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.title).localeCompare(String(b.title))
		)
	);

	/** Unassigned bucket when projects have no enterprise */
	const UNASSIGNED = '__none__';

	/**
	 * @param {string | null | undefined} iso
	 * @param {number} fallback
	 */
	function parseMs(iso, fallback) {
		if (!iso) return fallback;
		const t = Date.parse(iso);
		return Number.isFinite(t) ? t : fallback;
	}

	const range = $derived.by(() => {
		const now = Date.now();
		let min = now - 30 * DAY_MS;
		let max = now + 120 * DAY_MS;
		for (const p of projects) {
			const s = parseMs(p.start_at, NaN);
			const e = parseMs(p.end_at, NaN);
			if (Number.isFinite(s)) min = Math.min(min, s);
			if (Number.isFinite(e)) max = Math.max(max, e);
			if (Number.isFinite(s) && !Number.isFinite(e)) max = Math.max(max, s + 14 * DAY_MS);
		}
		for (const t of tasks) {
			const s = parseMs(t.start_at, NaN);
			const e = parseMs(t.end_at, NaN);
			if (Number.isFinite(s)) min = Math.min(min, s);
			if (Number.isFinite(e)) max = Math.max(max, e);
		}
		/* Snap to month starts */
		const start = new Date(min);
		start.setUTCDate(1);
		start.setUTCHours(0, 0, 0, 0);
		const end = new Date(max);
		end.setUTCMonth(end.getUTCMonth() + 1, 1);
		end.setUTCHours(0, 0, 0, 0);
		return { start: start.getTime(), end: end.getTime() };
	});

	const totalDays = $derived(Math.max(1, Math.ceil((range.end - range.start) / DAY_MS)));
	const chartWidth = $derived(Math.max(640, totalDays * PX_PER_DAY));

	const months = $derived.by(() => {
		/** @type {{ label: string, left: number, width: number }[]} */
		const out = [];
		const d = new Date(range.start);
		while (d.getTime() < range.end) {
			const left = ((d.getTime() - range.start) / DAY_MS) * PX_PER_DAY;
			const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
			const width = ((Math.min(next.getTime(), range.end) - d.getTime()) / DAY_MS) * PX_PER_DAY;
			out.push({
				label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }),
				left,
				width
			});
			d.setTime(next.getTime());
		}
		return out;
	});

	/**
	 * @param {string | null | undefined} startIso
	 * @param {string | null | undefined} endIso
	 * @param {number} [fallbackDays]
	 */
	function barStyle(startIso, endIso, fallbackDays = 7) {
		const hasStart = Boolean(startIso && Number.isFinite(Date.parse(startIso)));
		const hasEnd = Boolean(endIso && Number.isFinite(Date.parse(endIso)));
		if (!hasStart && !hasEnd) {
			return { display: 'none' };
		}
		let s = hasStart ? Date.parse(/** @type {string} */ (startIso)) : Date.parse(/** @type {string} */ (endIso)) - fallbackDays * DAY_MS;
		let e = hasEnd ? Date.parse(/** @type {string} */ (endIso)) : s + fallbackDays * DAY_MS;
		if (e < s) e = s + DAY_MS;
		const left = ((s - range.start) / DAY_MS) * PX_PER_DAY;
		const width = Math.max(PX_PER_DAY * 2, ((e - s) / DAY_MS) * PX_PER_DAY);
		return {
			left: `${left}px`,
			width: `${width}px`
		};
	}

	/** @param {string} id */
	function projectsForEnterprise(id) {
		if (id === UNASSIGNED) {
			return projects.filter((p) => !(p.enterprise_ids ?? []).length);
		}
		return projects.filter((p) => (p.enterprise_ids ?? []).includes(id));
	}

	/** @param {string} projectId */
	function tasksForProject(projectId) {
		return tasks.filter((t) => (t.project_ids ?? []).includes(projectId));
	}

	const rows = $derived.by(() => {
		/** @type {{ kind: 'enterprise' | 'project' | 'task', id: string, title: string, entId?: string, projectId?: string, entity: any }[]} */
		const out = [];
		const ents =
			sortedEnterprises.length > 0
				? sortedEnterprises
				: [{ id: UNASSIGNED, title: 'Projects', status: 'active', icon: null, kind: 'general' }];

		const showUnassigned =
			projects.some((p) => !(p.enterprise_ids ?? []).length) && sortedEnterprises.length > 0;

		for (const ent of ents) {
			out.push({ kind: 'enterprise', id: ent.id, title: ent.title, entity: ent });
			if (collapsed.has(ent.id)) continue;
			for (const p of projectsForEnterprise(ent.id)) {
				out.push({
					kind: 'project',
					id: p.id,
					title: p.title,
					entId: ent.id,
					entity: p
				});
				if (collapsedProjects.has(p.id)) continue;
				for (const t of tasksForProject(p.id)) {
					out.push({
						kind: 'task',
						id: t.id,
						title: t.title,
						entId: ent.id,
						projectId: p.id,
						entity: t
					});
				}
			}
		}

		if (showUnassigned) {
			out.push({
				kind: 'enterprise',
				id: UNASSIGNED,
				title: 'No enterprise',
				entity: { id: UNASSIGNED, title: 'No enterprise', status: 'draft', icon: null }
			});
			if (!collapsed.has(UNASSIGNED)) {
				for (const p of projectsForEnterprise(UNASSIGNED)) {
					out.push({ kind: 'project', id: p.id, title: p.title, entId: UNASSIGNED, entity: p });
					if (collapsedProjects.has(p.id)) continue;
					for (const t of tasksForProject(p.id)) {
						out.push({
							kind: 'task',
							id: t.id,
							title: t.title,
							entId: UNASSIGNED,
							projectId: p.id,
							entity: t
						});
					}
				}
			}
		}
		return out;
	});

	/** @param {string} id */
	function toggleEnt(id) {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}

	/** @param {string} id */
	function toggleProject(id) {
		const next = new Set(collapsedProjects);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsedProjects = next;
	}

	function todayLeft() {
		const left = ((Date.now() - range.start) / DAY_MS) * PX_PER_DAY;
		return `${left}px`;
	}
</script>

<svelte:head><title>Planning</title></svelte:head>

<div class="planning">
	<header class="toolbar">
		<span class="eyebrow-label-xs">Retro-planning</span>
		<div class="toolbar-actions">
			<button type="button" class="tool-btn" onclick={() => openComposer('enterprise')}>
				+ Enterprise
			</button>
			<button type="button" class="tool-btn" onclick={() => openComposer('project')}>+ Project</button>
		</div>
	</header>

	{#if enterprises.length === 0 && projects.length === 0}
		<div class="empty">
			<p class="empty-title">No enterprises yet</p>
			<p class="empty-body">
				Add farm lines (Eggs, Sheep, Mushrooms…) plus a General rollup — then attach projects with
				start/end dates to see the Gantt.
			</p>
			<button type="button" class="tool-btn primary" onclick={() => openComposer('enterprise')}
				>New enterprise</button
			>
		</div>
	{:else}
		<div class="gantt" style:--label-w="200px">
			<div class="gantt-scroll">
				<div class="gantt-inner" style:width="calc(var(--label-w) + {chartWidth}px)">
					<div class="month-row">
						<div class="label-cell head"></div>
						<div class="timeline-head" style:width="{chartWidth}px">
							{#each months as m}
								<span class="month" style:left="{m.left}px" style:width="{m.width}px">{m.label}</span>
							{/each}
							<span class="today" style:left={todayLeft()} aria-hidden="true"></span>
						</div>
					</div>

					{#each rows as row (row.kind + ':' + row.id + ':' + (row.projectId ?? ''))}
						<div class="gantt-row" class:ent={row.kind === 'enterprise'} class:proj={row.kind === 'project'} class:task={row.kind === 'task'}>
							<div class="label-cell">
								{#if row.kind === 'enterprise'}
									<button type="button" class="twist" onclick={() => toggleEnt(row.id)} aria-label="Toggle">
										{collapsed.has(row.id) ? '▸' : '▾'}
									</button>
									<EnterpriseBox state={row.entity.status || 'active'} icon={row.entity.icon} size={22} />
									<button
										type="button"
										class="name ent-name"
										onclick={() => {
											if (row.id !== UNASSIGNED) selectEntity('enterprise', row.id);
										}}
										>{row.title}</button
									>
								{:else if row.kind === 'project'}
									<span class="indent"></span>
									<button
										type="button"
										class="twist"
										onclick={() => toggleProject(row.id)}
										aria-label="Toggle tasks"
									>
										{collapsedProjects.has(row.id) ? '▸' : '▾'}
									</button>
									<ProjectBox
										state={deriveProjectStatus(row.id, tasks)}
										icon={row.entity.icon}
										size={18}
									/>
									<button
										type="button"
										class="name"
										onclick={() => selectEntity('project', row.id)}>{row.title}</button
									>
								{:else}
									<span class="indent deep"></span>
									<TaskBox state={row.entity.status} size={16} />
									<button type="button" class="name muted" onclick={() => selectEntity('task', row.id)}
										>{row.title}</button
									>
								{/if}
							</div>
							<div class="timeline" style:width="{chartWidth}px">
								<span class="today" style:left={todayLeft()} aria-hidden="true"></span>
								{#if row.kind === 'enterprise'}
									<!-- enterprise span = union of child project bars (visual only if any dated) -->
									{@const kids = projectsForEnterprise(row.id)}
									{@const starts = kids.map((p) => parseMs(p.start_at, NaN)).filter(Number.isFinite)}
									{@const ends = kids
										.map((p) => parseMs(p.end_at, parseMs(p.start_at, NaN) + 14 * DAY_MS))
										.filter(Number.isFinite)}
									{#if starts.length && ends.length}
										{@const s = Math.min(...starts)}
										{@const e = Math.max(...ends)}
										<span
											class="bar ent-bar"
											style:left="{( (s - range.start) / DAY_MS) * PX_PER_DAY}px"
											style:width="{Math.max(PX_PER_DAY * 2, ((e - s) / DAY_MS) * PX_PER_DAY)}px"
										></span>
									{/if}
								{:else if row.kind === 'project'}
									{@const st = barStyle(row.entity.start_at, row.entity.end_at, 14)}
									{#if st.display !== 'none'}
										<button
											type="button"
											class="bar proj-bar"
											style:left={st.left}
											style:width={st.width}
											onclick={() => selectEntity('project', row.id)}
											title={row.title}
										></button>
									{:else}
										<span class="undated">Set dates</span>
									{/if}
								{:else}
									{@const st = barStyle(row.entity.start_at, row.entity.end_at, 3)}
									{#if st.display !== 'none'}
										<button
											type="button"
											class="bar task-bar"
											style:left={st.left}
											style:width={st.width}
											onclick={() => selectEntity('task', row.id)}
											title={row.title}
										></button>
									{/if}
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.planning {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		overflow: hidden;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--fg-8);
		flex-shrink: 0;
	}

	.toolbar-actions {
		display: flex;
		gap: 6px;
	}

	.tool-btn {
		height: 32px;
		padding: 0 12px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.tool-btn.primary {
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		background-color: transparent;
		border: 1px solid transparent;
		color: var(--button-primary-fg);
	}

	.empty {
		padding: 40px 24px;
		max-width: 420px;
	}

	.empty-title {
		margin: 0 0 8px;
		font-size: 16px;
		font-weight: 600;
	}

	.empty-body {
		margin: 0 0 16px;
		font-size: 14px;
		line-height: 1.45;
		color: var(--fg-33);
	}

	.gantt {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.gantt-scroll {
		height: 100%;
		overflow: auto;
	}

	.gantt-inner {
		min-width: 100%;
	}

	.month-row,
	.gantt-row {
		display: flex;
		align-items: stretch;
		min-height: 36px;
		border-bottom: 1px solid var(--fg-8);
	}

	.gantt-row.ent {
		min-height: 42px;
		background: color-mix(in srgb, var(--fg) 3%, transparent);
	}

	.gantt-row.task {
		min-height: 30px;
	}

	.label-cell {
		position: sticky;
		left: 0;
		z-index: 2;
		width: var(--label-w);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 8px;
		background: var(--bg, var(--shell, #111));
		background: color-mix(in srgb, var(--shell, var(--bg)) 92%, transparent);
		backdrop-filter: blur(8px);
		border-right: 1px solid var(--fg-8);
		box-sizing: border-box;
	}

	.label-cell.head {
		z-index: 3;
	}

	.twist {
		width: 18px;
		border: 0;
		background: transparent;
		color: var(--fg-33);
		font-size: 11px;
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
	}

	.indent {
		width: 14px;
		flex-shrink: 0;
	}

	.indent.deep {
		width: 36px;
	}

	.name {
		border: 0;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		padding: 0;
	}

	.name.muted {
		font-weight: 500;
		color: var(--fg-66);
		font-size: 12px;
	}

	.ent-name {
		font-size: 14px;
	}

	.timeline-head,
	.timeline {
		position: relative;
		flex-shrink: 0;
		min-height: inherit;
	}

	.month {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		padding-left: 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		border-left: 1px solid var(--fg-8);
		box-sizing: border-box;
		overflow: hidden;
	}

	.today {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--accent-2, #c96);
		opacity: 0.7;
		pointer-events: none;
		z-index: 1;
	}

	.bar {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 14px;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
		padding: 0;
	}

	.ent-bar {
		height: 10px;
		background: color-mix(in srgb, var(--fg) 18%, transparent);
		border-radius: 3px;
		pointer-events: none;
	}

	.proj-bar {
		height: 16px;
		background: color-mix(in srgb, var(--accent-2, #c96) 55%, var(--fg-8));
	}

	.task-bar {
		height: 10px;
		background: color-mix(in srgb, var(--accent-1, #6a8) 50%, var(--fg-8));
		border-radius: 3px;
	}

	.undated {
		position: absolute;
		left: 8px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 11px;
		color: var(--fg-33);
	}
</style>
