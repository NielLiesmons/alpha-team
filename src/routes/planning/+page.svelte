<script>
	import EnterpriseBox from '$lib/components/EnterpriseBox.svelte';
	import ProjectBox from '$lib/components/ProjectBox.svelte';
	import TaskBox from '$lib/components/TaskBox.svelte';
	import { stringToColor } from '$lib/color.js';
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
	const PX_PER_DAY = 8;

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

	/** @param {any} p */
	function projectTint(p) {
		const seed = (p.icon && String(p.icon).trim()) || p.title || p.id || 'P';
		const { r, g, b } = stringToColor(seed);
		return `rgba(${r}, ${g}, ${b}, 0.22)`;
	}

	/** @param {any} p */
	function projectTintStrong(p) {
		const seed = (p.icon && String(p.icon).trim()) || p.title || p.id || 'P';
		const { r, g, b } = stringToColor(seed);
		return `rgba(${r}, ${g}, ${b}, 0.45)`;
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
			return projects.filter((p) => !(p.enterprise_ids ?? []).length);
		}
		return projects.filter((p) => (p.enterprise_ids ?? []).includes(id));
	}

	/** @param {string} projectId */
	function tasksForProject(projectId) {
		return tasks.filter((t) => (t.project_ids ?? []).includes(projectId));
	}

	/** Status → bar fill (matches TaskBox accents) */
	/** @param {string | undefined} status */
	function taskBarColor(status) {
		switch (status) {
			case 'closed':
				return 'color-mix(in srgb, var(--accent-1) 70%, transparent)';
			case 'inProgress':
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

	const rows = $derived.by(() => {
		/** @type {{ kind: 'enterprise' | 'project' | 'task', id: string, title: string, entity: any, projectId?: string }[]} */
		const out = [];
		const ents =
			sortedEnterprises.length > 0
				? sortedEnterprises
				: [{ id: UNASSIGNED, title: 'Projects', status: 'active', icon: null }];

		const showUnassigned =
			projects.some((p) => !(p.enterprise_ids ?? []).length) && sortedEnterprises.length > 0;

		/** @param {string} entId */
		function pushProjects(entId) {
			for (const p of projectsForEnterprise(entId)) {
				out.push({ kind: 'project', id: p.id, title: p.title, entity: p });
				if (collapsedProjects.has(p.id)) continue;
				for (const t of tasksForProject(p.id)) {
					out.push({
						kind: 'task',
						id: t.id,
						title: t.title,
						entity: t,
						projectId: p.id
					});
				}
			}
		}

		for (const ent of ents) {
			out.push({ kind: 'enterprise', id: ent.id, title: ent.title, entity: ent });
			if (collapsed.has(ent.id)) continue;
			pushProjects(ent.id);
		}

		if (showUnassigned) {
			out.push({
				kind: 'enterprise',
				id: UNASSIGNED,
				title: 'No enterprise',
				entity: { id: UNASSIGNED, title: 'No enterprise', status: 'draft', icon: null }
			});
			if (!collapsed.has(UNASSIGNED)) pushProjects(UNASSIGNED);
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
				Add farm lines (Eggs, Sheep…) plus General — then attach projects with start/end dates.
			</p>
			<button type="button" class="tool-btn primary" onclick={() => openComposer('enterprise')}
				>New enterprise</button
			>
		</div>
	{:else}
		<div class="gantt-scroll">
			<div class="gantt-inner" style:width="calc(var(--label-w) + {chartWidth}px)">
				<div class="gantt-row head">
					<div class="label-cell"></div>
					<div class="timeline" style:width="{chartWidth}px">
						{#each months as m}
							<span class="month" style:left="{m.left}px" style:width="{m.width}px">{m.label}</span>
						{/each}
						<span class="today" style:left={todayLeft()} aria-hidden="true"></span>
					</div>
				</div>

				{#each rows as row (row.kind + ':' + row.id + ':' + (row.projectId ?? ''))}
					<div
						class="gantt-row"
						class:ent={row.kind === 'enterprise'}
						class:proj={row.kind === 'project'}
						class:task={row.kind === 'task'}
					>
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
									}}>{row.title}</button
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
								<button type="button" class="name" onclick={() => selectEntity('project', row.id)}
									>{row.title}</button
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
								{@const kids = projectsForEnterprise(row.id)}
								{@const starts = kids.map((p) => parseMs(p.start_at, NaN)).filter(Number.isFinite)}
								{@const ends = kids
									.map((p) => parseMs(p.end_at, parseMs(p.start_at, NaN) + 14 * DAY_MS))
									.filter(Number.isFinite)}
								{#if starts.length && ends.length}
									{@const s = Math.min(...starts)}
									{@const e = Math.max(...ends)}
									<span
										class="ent-span"
										style:left="{( (s - range.start) / DAY_MS) * PX_PER_DAY}px"
										style:width="{Math.max(PX_PER_DAY * 2, ((e - s) / DAY_MS) * PX_PER_DAY)}px"
									></span>
								{/if}
							{:else if row.kind === 'project'}
								{@const box = span(row.entity.start_at, row.entity.end_at, 14)}
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
								{:else}
									<span class="undated">Set dates</span>
								{/if}
							{:else}
								{@const box = span(row.entity.start_at, row.entity.end_at, 3)}
								{#if box}
									<button
										type="button"
										class="task-bar"
										style:left="{box.left}px"
										style:width="{box.width}px"
										style:background={taskBarColor(row.entity.status)}
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
	{/if}
</div>

<style>
	.planning {
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* .feed already pads for list-top */
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
		--label-w: 200px;
	}

	.gantt-inner {
		min-width: 100%;
	}

	.gantt-row {
		display: flex;
		align-items: stretch;
		min-height: 40px;
		border-bottom: 1px solid var(--fg-8);
	}

	.gantt-row.head {
		min-height: 32px;
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--bg);
	}

	.gantt-row.ent {
		min-height: 44px;
	}

	.gantt-row.proj {
		min-height: 44px;
	}

	.gantt-row.task {
		min-height: 32px;
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
		box-sizing: border-box;
		border-right: 1px solid var(--fg-8);
		/* Match workspace plane (not a darker strip) */
		background: var(--bg);
	}

	.gantt-row.head,
	.gantt-row.head .label-cell {
		background: var(--bg);
	}

	@media (max-width: 767px) {
		.label-cell,
		.gantt-row.head,
		.gantt-row.head .label-cell {
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

	.indent {
		width: 10px;
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
		font-size: 12px;
		color: var(--fg-66);
	}

	.ent-name {
		font-size: 14px;
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

	.ent-span {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 8px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--fg) 14%, transparent);
		pointer-events: none;
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

	.undated {
		position: absolute;
		left: 8px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 11px;
		color: var(--fg-33);
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}
</style>
