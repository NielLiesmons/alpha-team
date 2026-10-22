<script>
	import ProjectBox from '$lib/components/ProjectBox.svelte';
	import TaskBox from '$lib/components/TaskBox.svelte';
	import { stringToColor } from '$lib/color.js';
	import {
		projectLifecycle,
		primaryEnterpriseId,
		projectDisplayIcon
	} from '$lib/project-status.js';
	import {
		enterprises,
		moments,
		openComposer,
		projects,
		selectEntity,
		tasks
	} from '$lib/workspace.svelte.js';

	/** @type {Set<string>} */
	let collapsedProjects = $state(new Set());

	const DAY_MS = 86_400_000;
	const PX_PER_DAY = 8;
	const ENT_RAIL_W = 28;
	/** ~11px per letter + padding — readable stacked caps without huge type */
	const LETTER_H = 11;
	const ENT_MIN_PAD = 20;

	const sortedEnterprises = $derived(
		[...enterprises].sort(
			(a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.title).localeCompare(String(b.title))
		)
	);

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

	/** Active planning projects: not fully closed/canceled */
	const planningProjects = $derived(
		projects.filter((p) => {
			return projectLifecycle(p, tasks) !== 'archived';
		})
	);

	/** @param {any} p */
	function projectTint(p) {
		const seed = projectDisplayIcon(p, enterprises) || p.title || p.id || 'P';
		const { r, g, b } = stringToColor(String(seed));
		return `rgba(${r}, ${g}, ${b}, 0.22)`;
	}

	/** @param {any} p */
	function projectTintStrong(p) {
		const seed = projectDisplayIcon(p, enterprises) || p.title || p.id || 'P';
		const { r, g, b } = stringToColor(String(seed));
		return `rgba(${r}, ${g}, ${b}, 0.45)`;
	}

	/** @param {string} title */
	function enterpriseColor(title) {
		const { r, g, b } = stringToColor(title || 'E');
		return `rgb(${r}, ${g}, ${b})`;
	}

	/** @param {string} title */
	function verticalLetters(title) {
		return String(title || '')
			.toUpperCase()
			.replace(/[^A-Z0-9]+/g, '')
			.split('')
			.slice(0, 16);
	}

	/** @param {string} taskId */
	function momentsForTask(taskId) {
		return moments.filter((m) => m.task_id === taskId && m.status !== 'canceled');
	}

	/**
	 * @param {string} projectId
	 */
	function projectSpanFromMoments(projectId) {
		const kids = tasksForProject(projectId);
		/** @type {number[]} */
		const starts = [];
		/** @type {number[]} */
		const ends = [];
		for (const t of kids) {
			for (const m of momentsForTask(t.id)) {
				const s = parseMs(m.start_at, NaN);
				const e = parseMs(m.end_at, NaN);
				if (Number.isFinite(s)) starts.push(s);
				if (Number.isFinite(e)) ends.push(e);
				else if (Number.isFinite(s)) ends.push(s + 3 * DAY_MS);
			}
			const d = parseMs(t.deadline_at, NaN);
			if (Number.isFinite(d)) {
				starts.push(d);
				ends.push(d);
			}
		}
		if (!starts.length && !ends.length) return null;
		const s = starts.length ? Math.min(...starts) : Math.min(...ends) - 3 * DAY_MS;
		const e = ends.length ? Math.max(...ends) : Math.max(...starts) + 3 * DAY_MS;
		return {
			left: ((s - range.start) / DAY_MS) * PX_PER_DAY,
			width: Math.max(PX_PER_DAY * 3, ((Math.max(e, s + DAY_MS) - s) / DAY_MS) * PX_PER_DAY),
			start: s,
			end: e
		};
	}

	const range = $derived.by(() => {
		const now = Date.now();
		let min = now - 30 * DAY_MS;
		let max = now + 120 * DAY_MS;
		for (const m of moments) {
			const s = parseMs(m.start_at, NaN);
			const e = parseMs(m.end_at, NaN);
			if (Number.isFinite(s)) min = Math.min(min, s);
			if (Number.isFinite(e)) max = Math.max(max, e);
			if (Number.isFinite(s) && !Number.isFinite(e)) max = Math.max(max, s + 14 * DAY_MS);
		}
		for (const t of tasks) {
			const d = parseMs(t.deadline_at, NaN);
			if (Number.isFinite(d)) {
				min = Math.min(min, d);
				max = Math.max(max, d);
			}
		}
		const start = new Date(min);
		start.setUTCDate(1);
		start.setUTCHours(0, 0, 0, 0);
		const end = new Date(max);
		end.setUTCMonth(end.getUTCMonth() + 1, 1);
		end.setUTCHours(0, 0, 0, 0);
		return { start: start.getTime(), end: end.getTime() };
	});

	const totalDays = $derived(Math.max(1, Math.ceil((range.end - range.start) / DAY_MS)));
	const chartWidth = $derived(Math.max(720, totalDays * PX_PER_DAY));

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
	function span(startIso, endIso, fallbackDays = 7) {
		const hasStart = Boolean(startIso && Number.isFinite(Date.parse(startIso)));
		const hasEnd = Boolean(endIso && Number.isFinite(Date.parse(endIso)));
		if (!hasStart && !hasEnd) return null;
		let s = hasStart
			? Date.parse(/** @type {string} */ (startIso))
			: Date.parse(/** @type {string} */ (endIso)) - fallbackDays * DAY_MS;
		let e = hasEnd ? Date.parse(/** @type {string} */ (endIso)) : s + fallbackDays * DAY_MS;
		if (e < s) e = s + DAY_MS;
		return {
			left: ((s - range.start) / DAY_MS) * PX_PER_DAY,
			width: Math.max(PX_PER_DAY * 3, ((e - s) / DAY_MS) * PX_PER_DAY),
			start: s,
			end: e
		};
	}

	/** @param {string} id */
	function projectsForEnterprise(id) {
		if (id === UNASSIGNED) {
			return planningProjects.filter((p) => !primaryEnterpriseId(p));
		}
		return planningProjects.filter((p) => primaryEnterpriseId(p) === id);
	}

	/** @param {string} projectId */
	function tasksForProject(projectId) {
		return tasks.filter((t) => {
			if (!(t.project_ids ?? []).includes(projectId)) return false;
			if (t.status === 'recurring') return true;
			return t.status !== 'closed' && t.status !== 'canceled';
		});
	}

	/** @param {string | undefined} status */
	function taskBarColor(status) {
		switch (status) {
			case 'closed':
				return 'color-mix(in srgb, var(--accent-1) 70%, transparent)';
			case 'inProgress':
			case 'recurring':
				return 'color-mix(in srgb, var(--accent-2) 75%, transparent)';
			case 'inReview':
				return 'color-mix(in srgb, var(--accent-1) 45%, var(--fg-8))';
			case 'canceled':
				return 'color-mix(in srgb, var(--fg) 12%, transparent)';
			case 'backlog':
				return 'color-mix(in srgb, var(--fg) 16%, transparent)';
			default:
				return 'color-mix(in srgb, var(--fg) 28%, transparent)';
		}
	}

	/**
	 * Enterprise groups with project/task rows (enterprise is a rail, not a timeline row).
	 */
	const groups = $derived.by(() => {
		/** @type {{ id: string, title: string, entity: any, letters: string[], minHeight: number, rows: { kind: 'project' | 'task', id: string, title: string, entity: any, projectId?: string }[] }[]} */
		const out = [];
		const ents =
			sortedEnterprises.length > 0
				? sortedEnterprises
				: [{ id: UNASSIGNED, title: 'Projects', status: 'active', icon: null }];

		const showUnassigned =
			planningProjects.some((p) => !primaryEnterpriseId(p)) && sortedEnterprises.length > 0;

		/** @param {any} ent */
		function buildGroup(ent) {
			/** @type {{ kind: 'project' | 'task', id: string, title: string, entity: any, projectId?: string }[]} */
			const rows = [];
			for (const p of projectsForEnterprise(ent.id)) {
				rows.push({ kind: 'project', id: p.id, title: p.title, entity: p });
				if (collapsedProjects.has(p.id)) continue;
				for (const t of tasksForProject(p.id)) {
					rows.push({
						kind: 'task',
						id: t.id,
						title: t.title,
						entity: t,
						projectId: p.id
					});
				}
			}
			const letters = verticalLetters(ent.title);
			const minHeight = Math.max(96, letters.length * LETTER_H + ENT_MIN_PAD);
			out.push({
				id: ent.id,
				title: ent.title,
				entity: ent,
				letters,
				minHeight,
				rows
			});
		}

		for (const ent of ents) buildGroup(ent);
		if (showUnassigned) {
			buildGroup({
				id: UNASSIGNED,
				title: 'None',
				status: 'draft',
				icon: null
			});
		}
		return out;
	});

	/** @param {string} id */
	function toggleProject(id) {
		const next = new Set(collapsedProjects);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsedProjects = next;
	}

	function todayLeft() {
		return `${((Date.now() - range.start) / DAY_MS) * PX_PER_DAY}px`;
	}
</script>

<svelte:head><title>Planning</title></svelte:head>

<div class="feed planning">
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
				Add farm lines (Eggs, Sheep…) plus General — then attach projects and date their tasks.
			</p>
			<button type="button" class="tool-btn primary" onclick={() => openComposer('enterprise')}
				>New enterprise</button
			>
		</div>
	{:else}
		<div class="gantt-scroll" style:--ent-rail-w="{ENT_RAIL_W}px">
			<div
				class="gantt-inner"
				style:width="calc(var(--ent-rail-w) + var(--label-w) + {chartWidth}px)"
			>
				<div class="gantt-row head">
					<div class="ent-rail head-rail" aria-hidden="true"></div>
					<div class="label-cell"></div>
					<div class="timeline" style:width="{chartWidth}px">
						{#each months as m}
							<span class="month" style:left="{m.left}px" style:width="{m.width}px">{m.label}</span>
						{/each}
						<span class="today" style:left={todayLeft()} aria-hidden="true"></span>
					</div>
				</div>

				{#each groups as group (group.id)}
					<div class="ent-group" style:min-height="{group.minHeight}px">
						<button
							type="button"
							class="ent-rail"
							style:color={enterpriseColor(group.title)}
							title={group.title}
							onclick={() => {
								if (group.id !== UNASSIGNED) selectEntity('enterprise', group.id);
							}}
						>
							<span class="ent-letters">
								{#each group.letters as ch, i (i)}
									<span class="ent-ch">{ch}</span>
								{/each}
							</span>
						</button>
						<div class="ent-body">
							{#if group.rows.length === 0}
								<div class="gantt-row empty-ent">
									<div class="label-cell">
										<span class="name muted">No projects</span>
									</div>
									<div class="timeline" style:width="{chartWidth}px">
										<span class="today" style:left={todayLeft()} aria-hidden="true"></span>
									</div>
								</div>
							{:else}
								{#each group.rows as row (row.kind + ':' + row.id + ':' + (row.projectId ?? ''))}
									<div class="gantt-row" class:proj={row.kind === 'project'} class:task={row.kind === 'task'}>
										<div class="label-cell">
											{#if row.kind === 'project'}
												<button
													type="button"
													class="twist"
													onclick={() => toggleProject(row.id)}
													aria-label="Toggle tasks"
												>
													{collapsedProjects.has(row.id) ? '▸' : '▾'}
												</button>
												<ProjectBox
													state={projectLifecycle(row.entity ?? { id: row.id }, tasks)}
													icon={projectDisplayIcon(row.entity, enterprises)}
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
												<button
													type="button"
													class="name muted"
													onclick={() => selectEntity('task', row.id)}>{row.title}</button
												>
											{/if}
										</div>
										<div class="timeline" style:width="{chartWidth}px">
											<span class="today" style:left={todayLeft()} aria-hidden="true"></span>
											{#if row.kind === 'project'}
												{@const box = projectSpanFromMoments(row.id)}
												{#if box}
													<button
														type="button"
														class="proj-container"
														style:left="{box.left}px"
														style:width="{box.width}px"
														style:background={projectTint(row.entity)}
														style:border-color={projectTintStrong(row.entity)}
														onclick={() => selectEntity('project', row.id)}
														title={row.title}
													></button>
												{/if}
											{:else}
												{#each momentsForTask(row.id) as m (m.id)}
													{@const box = span(m.start_at, m.end_at, 1)}
													{#if box}
														<button
															type="button"
															class="task-bar"
															style:left="{box.left}px"
															style:width="{box.width}px"
															style:background={taskBarColor(row.entity.status)}
															onclick={() => selectEntity('task', row.id)}
															title={m.title || row.title}
														></button>
													{/if}
												{/each}
												{#if row.entity.deadline_at}
													{@const d = parseMs(row.entity.deadline_at, NaN)}
													{#if Number.isFinite(d)}
														<span
															class="deadline-mark"
															style:left="{((d - range.start) / DAY_MS) * PX_PER_DAY}px"
															title="Deadline"
														></span>
													{/if}
												{/if}
											{/if}
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.planning {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 14px 10px;
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
		padding: 24px;
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

	.gantt-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		--label-w: 188px;
		--ent-rail-w: 28px;
	}

	.gantt-inner {
		min-width: 100%;
	}

	.ent-group {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--fg-8);
	}

	.ent-rail {
		position: sticky;
		left: 0;
		z-index: 3;
		width: var(--ent-rail-w);
		flex-shrink: 0;
		margin: 0;
		padding: 10px 0;
		border: 0;
		border-right: 1px solid var(--fg-8);
		background: var(--bg);
		cursor: pointer;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		box-sizing: border-box;
	}

	.ent-rail.head-rail {
		cursor: default;
		padding: 0;
		z-index: 4;
	}

	.ent-letters {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		line-height: 1;
	}

	.ent-ch {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1.15;
		user-select: none;
	}

	.ent-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.gantt-row {
		display: flex;
		align-items: stretch;
		min-height: 40px;
		border-bottom: 1px solid var(--fg-8);
	}

	.ent-body .gantt-row:last-child {
		border-bottom: 0;
	}

	.gantt-row.head {
		min-height: 32px;
		position: sticky;
		top: 0;
		z-index: 4;
		background: var(--bg);
	}

	.gantt-row.proj {
		min-height: 44px;
	}

	.gantt-row.task {
		min-height: 32px;
	}

	.gantt-row.empty-ent {
		flex: 1;
		min-height: 72px;
	}

	.label-cell {
		position: sticky;
		left: var(--ent-rail-w);
		z-index: 2;
		width: var(--label-w);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 8px;
		box-sizing: border-box;
		border-right: 1px solid var(--fg-8);
		background: var(--bg);
	}

	.gantt-row.head,
	.gantt-row.head .label-cell,
	.gantt-row.head .ent-rail {
		background: var(--bg);
	}

	@media (max-width: 767px) {
		.label-cell,
		.ent-rail,
		.gantt-row.head,
		.gantt-row.head .label-cell,
		.gantt-row.head .ent-rail {
			background: var(--shell);
		}
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

	.indent.deep {
		width: 24px;
		flex-shrink: 0;
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
		font-size: 12px;
		color: var(--fg-66);
	}

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
		opacity: 0.65;
		pointer-events: none;
		z-index: 1;
	}

	.proj-container {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 18px;
		border-radius: 10px;
		border: 1px solid transparent;
		cursor: pointer;
		padding: 0;
		box-sizing: border-box;
	}

	.task-bar {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 12px;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
		padding: 0;
	}

	.deadline-mark {
		position: absolute;
		top: 4px;
		bottom: 4px;
		width: 2px;
		margin-left: -1px;
		background: var(--accent-1, #c66);
		border-radius: 1px;
		pointer-events: none;
		opacity: 0.85;
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}
</style>
