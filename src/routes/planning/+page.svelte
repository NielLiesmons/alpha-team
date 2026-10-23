<script>
	import { onMount } from 'svelte';
	import ProjectBox from '$lib/components/ProjectBox.svelte';
	import TaskBox from '$lib/components/TaskBox.svelte';
	import {
		DAY_MS,
		PLANNING_ZOOMS,
		endOfUnit,
		planningView,
		setPlanningZoom,
		startOfUnit
	} from '$lib/planning-view.svelte.js';
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
		saveMoment,
		selectEntity,
		tasks
	} from '$lib/workspace.svelte.js';

	/** @type {Set<string>} */
	let collapsedProjects = $state(new Set());
	/** @type {Set<string>} */
	let collapsedEnterprises = $state(new Set());

	/** @type {null | { taskId: string, startMs: number, endMs: number }} */
	let draftDraw = $state(null);
	/**
	 * @type {null | {
	 *   momentId: string,
	 *   mode: 'move' | 'resize-start' | 'resize-end',
	 *   originX: number,
	 *   origStart: number,
	 *   origEnd: number
	 * }}
	 */
	let drag = $state(null);

	/** @type {HTMLDivElement | undefined} */
	let scrollEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let timelineMeasure = $state();
	let timelinePaneW = $state(640);

	/** @type {null | { x: number, y: number, top: number }} */
	let pan = $state(null);

	const UNASSIGNED = '__none__';
	const LABEL_W = 200;

	const zoom = $derived(planningView.zoom);
	const range = $derived.by(() => {
		const start = startOfUnit(planningView.anchorMs, planningView.zoom);
		return { start, end: endOfUnit(start, planningView.zoom) };
	});

	const totalDays = $derived(Math.max(1, (range.end - range.start) / DAY_MS));
	const chartWidth = $derived(Math.max(120, timelinePaneW));
	const PX_PER_DAY = $derived(chartWidth / totalDays);

	const sortedEnterprises = $derived(
		[...enterprises].sort(
			(a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.title).localeCompare(String(b.title))
		)
	);

	/**
	 * @param {string | null | undefined} iso
	 * @param {number} fallback
	 */
	function parseMs(iso, fallback) {
		if (!iso) return fallback;
		const t = Date.parse(iso);
		return Number.isFinite(t) ? t : fallback;
	}

	/** @param {number} ms */
	function toIsoDay(ms) {
		const d = new Date(ms);
		return `${d.toISOString().slice(0, 10)}T12:00:00Z`;
	}

	const planningProjects = $derived(
		projects.filter((p) => projectLifecycle(p, tasks) !== 'archived')
	);

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
		const left = ((s - range.start) / DAY_MS) * PX_PER_DAY;
		const width = Math.max(4, ((Math.max(e, s + DAY_MS) - s) / DAY_MS) * PX_PER_DAY);
		return { left, width };
	}

	const ticks = $derived.by(() => {
		/** @type {{ label: string, left: number, width: number }[]} */
		const out = [];
		if (zoom === 'year') {
			const d = new Date(range.start);
			while (d.getTime() < range.end) {
				const left = ((d.getTime() - range.start) / DAY_MS) * PX_PER_DAY;
				const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
				const width = ((Math.min(next.getTime(), range.end) - d.getTime()) / DAY_MS) * PX_PER_DAY;
				out.push({
					label: d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }),
					left,
					width
				});
				d.setTime(next.getTime());
			}
			return out;
		}
		if (zoom === 'month') {
			const d = new Date(range.start);
			d.setUTCHours(0, 0, 0, 0);
			while (d.getTime() < range.end) {
				const left = ((d.getTime() - range.start) / DAY_MS) * PX_PER_DAY;
				out.push({
					label: String(d.getUTCDate()),
					left,
					width: PX_PER_DAY
				});
				d.setUTCDate(d.getUTCDate() + 1);
			}
			return out;
		}
		if (zoom === 'week') {
			const d = new Date(range.start);
			while (d.getTime() < range.end) {
				const left = ((d.getTime() - range.start) / DAY_MS) * PX_PER_DAY;
				out.push({
					label: d.toLocaleDateString(undefined, {
						weekday: 'short',
						day: 'numeric',
						timeZone: 'UTC'
					}),
					left,
					width: PX_PER_DAY
				});
				d.setUTCDate(d.getUTCDate() + 1);
			}
			return out;
		}
		/* day — hour ticks */
		for (let h = 0; h < 24; h++) {
			const left = (h / 24) * chartWidth;
			out.push({
				label: h % 3 === 0 ? `${String(h).padStart(2, '0')}:00` : '',
				left,
				width: chartWidth / 24
			});
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
		/* Clip to viewport — still show if it overlaps the unit */
		if (e < range.start || s > range.end) return null;
		const visS = Math.max(s, range.start);
		const visE = Math.min(e, range.end);
		return {
			left: ((visS - range.start) / DAY_MS) * PX_PER_DAY,
			width: Math.max(4, ((visE - visS) / DAY_MS) * PX_PER_DAY),
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
			return t.status !== 'closed' && t.status !== 'canceled';
		});
	}

	/** @param {string | undefined} status */
	function barTone(status) {
		if (status === 'closed') return 'done';
		if (status === 'inProgress' || status === 'inReview') return 'progress';
		return 'planned';
	}

	/**
	 * @param {string} taskId
	 * @param {'start' | 'end'} edge
	 */
	function taskEdgeX(taskId, edge) {
		const ms = momentsForTask(taskId);
		if (!ms.length) return null;
		/** @type {number[]} */
		const vals = [];
		for (const m of ms) {
			const box = span(m.start_at, m.end_at, 1);
			if (!box) continue;
			vals.push(edge === 'start' ? box.left : box.left + box.width);
		}
		if (!vals.length) return null;
		return edge === 'start' ? Math.min(...vals) : Math.max(...vals);
	}

	const groups = $derived.by(() => {
		/** @type {{ id: string, title: string, entity: any, rows: { kind: 'project' | 'task', id: string, title: string, entity: any, projectId?: string }[] }[]} */
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
			if (!collapsedEnterprises.has(ent.id)) {
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
			}
			out.push({ id: ent.id, title: ent.title, entity: ent, rows });
		}

		for (const ent of ents) buildGroup(ent);
		if (showUnassigned) {
			buildGroup({ id: UNASSIGNED, title: 'None', status: 'draft', icon: null });
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

	/** @param {string} id */
	function toggleEnterprise(id) {
		const next = new Set(collapsedEnterprises);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsedEnterprises = next;
	}

	function todayLeft() {
		const now = Date.now();
		if (now < range.start || now > range.end) return null;
		return ((now - range.start) / DAY_MS) * PX_PER_DAY;
	}

	/** @param {HTMLElement} el @param {number} clientX */
	function xToMs(el, clientX) {
		const r = el.getBoundingClientRect();
		const x = Math.max(0, Math.min(clientX - r.left, chartWidth));
		return range.start + (x / PX_PER_DAY) * DAY_MS;
	}

	/** @param {PointerEvent} e @param {string} taskId */
	function onTimelineDown(e, taskId) {
		if (e.button !== 0) return;
		const el = /** @type {HTMLElement} */ (e.currentTarget);
		if (e.target !== el) return;
		e.preventDefault();
		const ms = xToMs(el, e.clientX);
		draftDraw = { taskId, startMs: ms, endMs: ms + DAY_MS };
		el.setPointerCapture(e.pointerId);
	}

	/** @param {PointerEvent} e */
	function onTimelineMove(e) {
		const el = /** @type {HTMLElement} */ (e.currentTarget);
		if (draftDraw) {
			const ms = xToMs(el, e.clientX);
			const a = draftDraw.startMs;
			draftDraw = {
				...draftDraw,
				startMs: Math.min(a, ms),
				endMs: Math.max(a, ms)
			};
			if (draftDraw.endMs - draftDraw.startMs < DAY_MS) {
				draftDraw = { ...draftDraw, endMs: draftDraw.startMs + DAY_MS };
			}
			return;
		}
		if (drag) {
			const dx = e.clientX - drag.originX;
			const dMs = (dx / PX_PER_DAY) * DAY_MS;
			const m = moments.find((x) => x.id === drag.momentId);
			if (!m) return;
			let s = drag.origStart;
			let en = drag.origEnd;
			if (drag.mode === 'move') {
				s = drag.origStart + dMs;
				en = drag.origEnd + dMs;
			} else if (drag.mode === 'resize-start') {
				s = Math.min(drag.origStart + dMs, drag.origEnd - DAY_MS);
			} else {
				en = Math.max(drag.origEnd + dMs, drag.origStart + DAY_MS);
			}
			const i = moments.findIndex((x) => x.id === m.id);
			if (i >= 0) {
				moments[i] = { ...moments[i], start_at: toIsoDay(s), end_at: toIsoDay(en) };
			}
		}
	}

	/** @param {PointerEvent} e */
	async function onTimelineUp(e) {
		const el = /** @type {HTMLElement} */ (e.currentTarget);
		try {
			el.releasePointerCapture(e.pointerId);
		} catch {
			/* */
		}
		if (draftDraw) {
			const { taskId, startMs, endMs } = draftDraw;
			draftDraw = null;
			const s = Math.min(startMs, endMs);
			const en = Math.max(startMs, endMs, s + DAY_MS);
			try {
				await saveMoment(
					{
						task_id: taskId,
						start_at: toIsoDay(s),
						end_at: toIsoDay(en),
						status: 'planned'
					},
					true
				);
			} catch (err) {
				alert(err instanceof Error ? err.message : String(err));
			}
			return;
		}
		if (drag) {
			const m = moments.find((x) => x.id === drag?.momentId);
			const finished = drag;
			drag = null;
			if (m && finished) {
				try {
					await saveMoment(m, false);
				} catch (err) {
					alert(err instanceof Error ? err.message : String(err));
				}
			}
		}
	}

	/**
	 * @param {PointerEvent} e
	 * @param {any} moment
	 * @param {'move' | 'resize-start' | 'resize-end'} mode
	 */
	function onBarPointerDown(e, moment, mode) {
		e.stopPropagation();
		e.preventDefault();
		const s = parseMs(moment.start_at, Date.now());
		const en = parseMs(moment.end_at, s + 3 * DAY_MS);
		drag = {
			momentId: moment.id,
			mode,
			originX: e.clientX,
			origStart: s,
			origEnd: en
		};
		const tl = /** @type {HTMLElement | null} */ (
			/** @type {HTMLElement} */ (e.currentTarget).closest('.timeline')
		);
		tl?.setPointerCapture(e.pointerId);
	}

	/** @param {WheelEvent} e */
	function onWheelZoom(e) {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const i = PLANNING_ZOOMS.indexOf(zoom);
			if (e.deltaY < 0 && i > 0) setPlanningZoom(PLANNING_ZOOMS[i - 1]);
			else if (e.deltaY > 0 && i < PLANNING_ZOOMS.length - 1) setPlanningZoom(PLANNING_ZOOMS[i + 1]);
		}
		/* Otherwise let the gantt scroll normally — no period jumping */
	}

	/** @param {PointerEvent} e */
	function onPanDown(e) {
		if (e.button !== 1 || !scrollEl) return;
		e.preventDefault();
		pan = { x: e.clientX, y: e.clientY, top: scrollEl.scrollTop };
		scrollEl.setPointerCapture(e.pointerId);
		scrollEl.classList.add('panning');
	}

	/** @param {PointerEvent} e */
	function onPanMove(e) {
		if (!pan || !scrollEl) return;
		/* Keep origin fixed — updating y each move made scroll jump / feel broken */
		scrollEl.scrollTop = pan.top - (e.clientY - pan.y);
	}

	/** @param {PointerEvent} e */
	function onPanUp(e) {
		if (!pan || !scrollEl) return;
		try {
			scrollEl.releasePointerCapture(e.pointerId);
		} catch {
			/* */
		}
		scrollEl.classList.remove('panning');
		pan = null;
	}

	/** @param {MouseEvent} e */
	function onAuxClick(e) {
		if (e.button === 1) e.preventDefault();
	}

	let pinchDist = $state(0);
	/** @param {TouchEvent} e */
	function onTouchStart(e) {
		if (e.touches.length === 2) {
			const a = e.touches[0];
			const b = e.touches[1];
			pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		}
	}
	/** @param {TouchEvent} e */
	function onTouchMove(e) {
		if (e.touches.length !== 2 || !pinchDist) return;
		const a = e.touches[0];
		const b = e.touches[1];
		const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		const ratio = d / pinchDist;
		const i = PLANNING_ZOOMS.indexOf(zoom);
		if (ratio > 1.12 && i > 0) {
			setPlanningZoom(PLANNING_ZOOMS[i - 1]);
			pinchDist = d;
		} else if (ratio < 0.88 && i < PLANNING_ZOOMS.length - 1) {
			setPlanningZoom(PLANNING_ZOOMS[i + 1]);
			pinchDist = d;
		}
	}

	/** @param {any} task */
	function deadlineLeft(task) {
		const d = parseMs(task.deadline_at, NaN);
		if (!Number.isFinite(d) || d < range.start || d > range.end) return null;
		return ((d - range.start) / DAY_MS) * PX_PER_DAY;
	}

	const depLinks = $derived.by(() => {
		/** @type {{ x1: number, y1: number, x2: number, y2: number }[]} */
		const links = [];
		const ROW_H = { eyebrow: 28, proj: 40, task: 36 };
		let y = 0;
		/** @type {Map<string, number>} */
		const taskMidY = new Map();

		for (const group of groups) {
			y += ROW_H.eyebrow;
			for (const row of group.rows) {
				const h = row.kind === 'project' ? ROW_H.proj : ROW_H.task;
				if (row.kind === 'task') taskMidY.set(row.id, y + h / 2);
				y += h;
			}
		}

		for (const t of tasks) {
			const deps = Array.isArray(t.depends_on) ? t.depends_on : [];
			if (!deps.length) continue;
			const y2 = taskMidY.get(t.id);
			const x2raw = taskEdgeX(t.id, 'start');
			if (y2 == null || x2raw == null) continue;
			for (const depId of deps) {
				const y1 = taskMidY.get(depId);
				const x1raw = taskEdgeX(depId, 'end');
				if (y1 == null || x1raw == null) continue;
				links.push({ x1: x1raw + 5, y1, x2: x2raw - 5, y2 });
			}
		}
		return links;
	});

	/**
	 * @param {string} enterpriseId
	 */
	function addProject(enterpriseId) {
		openComposer(
			'project',
			undefined,
			undefined,
			enterpriseId === UNASSIGNED ? {} : { primary_enterprise_id: enterpriseId }
		);
	}

	/** @param {string} projectId */
	function addTask(projectId) {
		openComposer('task', undefined, 'open', { project_ids: [projectId] });
	}

	onMount(() => {
		planningView.anchorMs = startOfUnit(Date.now(), planningView.zoom);
		const el = timelineMeasure;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect?.width;
			if (w && w > 40) timelinePaneW = w;
		});
		ro.observe(el);
		timelinePaneW = el.clientWidth || 640;
		return () => ro.disconnect();
	});
</script>

<svelte:head><title>Planning</title></svelte:head>

<div
	class="feed planning"
	onwheel={onWheelZoom}
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
>
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
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="gantt"
			bind:this={scrollEl}
			onpointerdown={onPanDown}
			onpointermove={onPanMove}
			onpointerup={onPanUp}
			onpointercancel={onPanUp}
			onauxclick={onAuxClick}
		>
			<div class="gantt-head">
				<div class="label-cell head-label" style:width="{LABEL_W}px"></div>
				<div class="timeline-pane head-timeline" bind:this={timelineMeasure}>
					<div class="timeline" style:width="{chartWidth}px">
						{#each ticks as t}
							{#if t.label}
								<span class="tick" style:left="{t.left}px" style:width="{t.width}px">{t.label}</span>
							{:else}
								<span class="tick bare" style:left="{t.left}px" style:width="{t.width}px"></span>
							{/if}
						{/each}
						{#if todayLeft() != null}
							<span class="today-line" style:left="{todayLeft()}px" aria-hidden="true"></span>
						{/if}
					</div>
				</div>
			</div>

			<div class="gantt-body">
				<div class="labels-col" style:width="{LABEL_W}px">
					{#each groups as group (group.id)}
						<div class="label-row eyebrow-row">
							<div class="name-cluster">
								<button
									type="button"
									class="ent-name"
									onclick={() => {
										if (group.id !== UNASSIGNED) selectEntity('enterprise', group.id);
									}}
								>
									<span class="eyebrow-label-xs">{group.title}</span>
								</button>
								<button
									type="button"
									class="chev"
									class:collapsed={collapsedEnterprises.has(group.id)}
									aria-label="Toggle projects"
									aria-expanded={!collapsedEnterprises.has(group.id)}
									onclick={() => toggleEnterprise(group.id)}
								>
									<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
										<path
											d="M2.5 4.2 L6 7.8 L9.5 4.2"
											stroke="currentColor"
											stroke-width="1.6"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
							</div>
							<button
								type="button"
								class="row-plus eyebrow-plus"
								aria-label="Add project to {group.title}"
								onclick={() => addProject(group.id)}
							>
								<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
									<path
										d="M6 1v10M1 6h10"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
									/>
								</svg>
							</button>
						</div>
						{#each group.rows as row (row.kind + ':' + row.id + ':' + (row.projectId ?? ''))}
							<div
								class="label-row"
								class:proj={row.kind === 'project'}
								class:task={row.kind === 'task'}
							>
								{#if row.kind === 'project'}
									<ProjectBox
										state={projectLifecycle(row.entity ?? { id: row.id }, tasks)}
										icon={projectDisplayIcon(row.entity, enterprises)}
										size={18}
									/>
									<div class="name-cluster">
										<button
											type="button"
											class="name"
											onclick={() => selectEntity('project', row.id)}>{row.title}</button
										>
										<button
											type="button"
											class="chev"
											class:collapsed={collapsedProjects.has(row.id)}
											aria-label="Toggle tasks"
											aria-expanded={!collapsedProjects.has(row.id)}
											onclick={() => toggleProject(row.id)}
										>
											<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
												<path
													d="M2.5 4.2 L6 7.8 L9.5 4.2"
													stroke="currentColor"
													stroke-width="1.6"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										</button>
									</div>
									<button
										type="button"
										class="row-plus"
										aria-label="Add task"
										onclick={() => addTask(row.id)}
									>
										<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
											<path
												d="M6 1v10M1 6h10"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
											/>
										</svg>
									</button>
								{:else}
									<span class="indent"></span>
									<TaskBox state={row.entity.status} size={16} />
									<button
										type="button"
										class="name muted"
										onclick={() => selectEntity('task', row.id)}>{row.title}</button
									>
								{/if}
							</div>
						{/each}
					{/each}
				</div>

				<div class="timeline-pane body-timeline">
					<div class="timeline-stack" style:width="{chartWidth}px">
						{#if todayLeft() != null}
							<span class="today-line body-today" style:left="{todayLeft()}px" aria-hidden="true"
							></span>
						{/if}
						{#if depLinks.length}
							<svg class="deps-layer" width={chartWidth} height="100%" aria-hidden="true">
								{#each depLinks as link, i (i)}
									{@const mx = (link.x1 + link.x2) / 2}
									<path
										class="dep-path"
										d="M {link.x1} {link.y1} C {mx} {link.y1}, {mx} {link.y2}, {link.x2} {link.y2}"
										marker-end="url(#dep-arrow)"
									/>
								{/each}
								<defs>
									<marker
										id="dep-arrow"
										viewBox="0 0 8 8"
										refX="7"
										refY="4"
										markerWidth="6"
										markerHeight="6"
										orient="auto"
									>
										<path d="M0 0 L8 4 L0 8 Z" fill="var(--fg-33)" />
									</marker>
								</defs>
							</svg>
						{/if}

						{#each groups as group (group.id)}
							<div class="tl-row eyebrow-row"></div>
							{#each group.rows as row (row.kind + ':' + row.id + ':' + (row.projectId ?? ''))}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="tl-row timeline"
									class:proj={row.kind === 'project'}
									class:task={row.kind === 'task'}
									class:draw={row.kind === 'task'}
									onpointerdown={row.kind === 'task'
										? (e) => onTimelineDown(e, row.id)
										: undefined}
									onpointermove={row.kind === 'task' ? onTimelineMove : undefined}
									onpointerup={row.kind === 'task' ? onTimelineUp : undefined}
								>
									{#if row.kind === 'project'}
										{@const box = projectSpanFromMoments(row.id)}
										{#if box}
											<button
												type="button"
												class="proj-line"
												style:left="{box.left}px"
												style:width="{box.width}px"
												onclick={() => selectEntity('project', row.id)}
												title={row.title}
											></button>
										{/if}
									{:else}
										{#each momentsForTask(row.id) as m (m.id)}
											{@const box = span(m.start_at, m.end_at, 1)}
											{#if box}
												<div
													class="task-bar tone-{barTone(row.entity.status)}"
													style:left="{box.left}px"
													style:width="{box.width}px"
													role="button"
													tabindex="0"
													title={m.title || row.title}
													onpointerdown={(e) => onBarPointerDown(e, m, 'move')}
													onclick={() => selectEntity('task', row.id)}
													onkeydown={(e) => e.key === 'Enter' && selectEntity('task', row.id)}
												>
													<span
														class="bar-handle start"
														onpointerdown={(e) => onBarPointerDown(e, m, 'resize-start')}
													></span>
													<span class="dep-dot start" aria-hidden="true"></span>
													<span class="dep-dot end" aria-hidden="true"></span>
													<span
														class="bar-handle end"
														onpointerdown={(e) => onBarPointerDown(e, m, 'resize-end')}
													></span>
												</div>
											{/if}
										{/each}
										{#if draftDraw?.taskId === row.id}
											{@const left =
												((Math.min(draftDraw.startMs, draftDraw.endMs) - range.start) / DAY_MS) *
												PX_PER_DAY}
											{@const width = Math.max(
												PX_PER_DAY * 0.25,
												(Math.abs(draftDraw.endMs - draftDraw.startMs) / DAY_MS) * PX_PER_DAY
											)}
											<div
												class="task-bar draft tone-planned"
												style:left="{left}px"
												style:width="{width}px"
											></div>
										{/if}
										{#if row.entity.deadline_at}
											{@const dl = deadlineLeft(row.entity)}
											{#if dl != null}
												<span
													class="deadline-line"
													style:left="{dl}px"
													title="Deadline"
													aria-hidden="true"
												></span>
											{/if}
										{/if}
									{/if}
								</div>
							{/each}
						{/each}
					</div>
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
		height: 100%;
		/* Sit under transparent list-top so head + chrome read as one */
		padding-top: 0 !important;
		padding-bottom: var(--feed-pad-bottom, 36px);
		--label-w: 200px;
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

	/* Fixed label column + clipped timeline pane (no sticky overlay) */
	.gantt {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: auto;
		touch-action: pan-y;
		overscroll-behavior-x: none;
	}

	.gantt.panning {
		cursor: grabbing;
		user-select: none;
	}

	.gantt-head {
		position: sticky;
		top: 0;
		z-index: 4;
		display: flex;
		align-items: stretch;
		height: 48px;
		min-height: 48px;
		background: var(--bg);
		border-bottom: 1px solid var(--fg-8);
	}

	.gantt-body {
		display: flex;
		align-items: flex-start;
		min-width: 0;
	}

	.labels-col {
		flex-shrink: 0;
		background: var(--bg);
		border-right: 1px solid var(--fg-8);
		box-sizing: border-box;
	}

	.timeline-pane {
		flex: 1;
		min-width: 0;
		overflow: hidden; /* clip — never scroll under labels */
	}

	.head-timeline {
		position: relative;
		/* Ticks run under the glass zoom-seg (higher z on list-top actions) */
		z-index: 0;
	}

	.body-timeline {
		position: relative;
	}

	.timeline-stack {
		position: relative;
	}

	.label-cell.head-label {
		flex-shrink: 0;
		box-sizing: border-box;
		border-right: 1px solid var(--fg-8);
		background: var(--bg);
	}

	.label-row,
	.tl-row {
		display: flex;
		align-items: center;
		height: 36px;
		min-height: 36px;
		max-height: 36px;
		box-sizing: border-box;
		border-bottom: 1px solid var(--fg-8);
		position: relative;
	}

	.label-row.eyebrow-row,
	.tl-row.eyebrow-row {
		height: 28px;
		min-height: 28px;
		max-height: 28px;
		border-bottom: 0;
		gap: 6px;
		padding: 0 8px 0 12px;
	}

	.label-row.proj,
	.tl-row.proj {
		height: 40px;
		min-height: 40px;
		max-height: 40px;
	}

	.label-row.proj {
		padding: 0 8px 0 22px;
		gap: 6px;
	}

	.label-row.task {
		padding: 0 8px 0 22px;
		gap: 8px;
	}

	.tl-row.eyebrow-row {
		padding: 0;
	}

	.label-row.eyebrow-row:hover .chev,
	.label-row.eyebrow-row:hover .eyebrow-plus,
	.label-row.proj:hover .chev,
	.label-row.proj:hover .row-plus {
		opacity: 1;
	}

	.name-cluster {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		flex: 1;
	}

	.ent-name {
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
		color: inherit;
		min-width: 0;
		flex: 0 1 auto;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chev {
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
		padding: 1px 0 0;
		flex-shrink: 0;
		opacity: 0;
		transition:
			opacity 0.12s ease,
			transform 0.15s ease;
	}

	.chev.collapsed {
		transform: rotate(-90deg);
	}

	.chev:hover {
		color: var(--fg-66);
	}

	.row-plus {
		opacity: 0;
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
		flex-shrink: 0;
		margin-left: auto;
		transition: opacity 0.12s ease;
	}

	.row-plus:hover {
		color: var(--fg);
		background: var(--fg-8);
	}

	.indent {
		width: 8px;
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
		flex: 0 1 auto;
		padding: 0;
	}

	.name.muted {
		font-weight: 500;
		font-size: 12px;
		color: var(--fg-66);
		flex: 1;
	}

	.timeline {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		box-sizing: border-box;
	}

	.tl-row.timeline {
		display: block;
		/* keep fixed row height from .tl-row / .proj */
	}

	.timeline.draw {
		cursor: crosshair;
	}

	.tick {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		padding-left: 4px;
		font-size: 10px;
		font-weight: 600;
		color: var(--fg-33);
		border-left: 1px solid var(--fg-8);
		box-sizing: border-box;
		overflow: hidden;
	}

	.tick.bare {
		padding: 0;
	}

	.today-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--fg-66);
		pointer-events: none;
		z-index: 3;
		transform: translateX(-50%);
	}

	.today-line.body-today {
		z-index: 2;
	}

	.deps-layer {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		pointer-events: none;
		z-index: 1;
		overflow: visible;
	}

	.dep-path {
		fill: none;
		stroke: var(--fg-33);
		stroke-width: 1.25;
	}

	.proj-line {
		position: absolute;
		top: 0;
		bottom: 0;
		margin-top: auto;
		margin-bottom: auto;
		height: 3px;
		border: 0;
		border-radius: 2px;
		background: var(--fg-16);
		cursor: pointer;
		padding: 0;
		box-sizing: border-box;
	}

	.task-bar {
		position: absolute;
		top: 0;
		bottom: 0;
		margin-top: auto;
		margin-bottom: auto;
		height: 14px;
		border: 0;
		border-radius: 4px;
		cursor: grab;
		padding: 0;
		box-sizing: border-box;
		z-index: 2;
		min-width: 4px;
		overflow: visible;
	}

	.task-bar.tone-planned {
		background: var(--fg-33);
	}

	.task-bar.tone-progress {
		background: var(--accent-2-66);
	}

	.task-bar.tone-done {
		background: var(--accent-1-66);
	}

	.task-bar.draft {
		opacity: 0.35;
		pointer-events: none;
		outline: 1px dashed var(--fg-33);
		outline-offset: -1px;
	}

	.task-bar:active {
		cursor: grabbing;
	}

	.dep-dot {
		position: absolute;
		top: 50%;
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		padding: 0;
		pointer-events: auto;
		z-index: 4;
		opacity: 0;
		transition: opacity 0.12s ease;
		cursor: pointer;
	}

	.dep-dot::after {
		content: '';
		width: 9px;
		height: 9px;
		border-radius: 9999px;
		background: var(--bg);
		border: 1.5px solid var(--fg-33);
		box-sizing: border-box;
		pointer-events: none;
	}

	.task-bar:hover .dep-dot,
	.dep-dot:hover {
		opacity: 1;
	}

	.dep-dot.start {
		left: 0;
		transform: translate(calc(-100% - 1px), -50%);
	}

	.dep-dot.end {
		left: auto;
		right: 0;
		transform: translate(calc(100% + 1px), -50%);
	}

	.bar-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: ew-resize;
		z-index: 3;
	}

	.bar-handle.start {
		left: 0;
	}

	.bar-handle.end {
		right: 0;
	}

	.deadline-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--accent-2);
		opacity: 0.9;
		pointer-events: none;
		z-index: 3;
		transform: translateX(-50%);
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	@media (max-width: 767px) {
		.gantt-head,
		.labels-col,
		.label-cell.head-label {
			background: var(--shell);
		}
	}
</style>
