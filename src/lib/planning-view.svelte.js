/**
 * Shared Planning timeframe — used by AppShell chrome + the gantt page.
 * Viewport shows exactly one unit of the selected zoom.
 */

/** @typedef {'day' | 'week' | 'month' | 'year'} PlanningZoom */

export const DAY_MS = 86_400_000;

export const PLANNING_ZOOMS = /** @type {const} */ (['day', 'week', 'month', 'year']);

export const PLANNING_ZOOM_LABELS = {
	day: 'Day',
	week: 'Week',
	month: 'Month',
	year: 'Year'
};

/**
 * Snap a timestamp to the start of its unit (UTC).
 * @param {number} ms
 * @param {PlanningZoom} zoom
 */
export function startOfUnit(ms, zoom) {
	const d = new Date(ms);
	if (zoom === 'day') {
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	}
	if (zoom === 'week') {
		const day = d.getUTCDay();
		const toMon = day === 0 ? -6 : 1 - day;
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + toMon);
	}
	if (zoom === 'month') {
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
	}
	return Date.UTC(d.getUTCFullYear(), 0, 1);
}

/**
 * Exclusive end of the unit that starts at `startMs`.
 * @param {number} startMs
 * @param {PlanningZoom} zoom
 */
export function endOfUnit(startMs, zoom) {
	const d = new Date(startMs);
	if (zoom === 'day') return startMs + DAY_MS;
	if (zoom === 'week') return startMs + 7 * DAY_MS;
	if (zoom === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
	return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
}

/**
 * @param {number} startMs
 * @param {PlanningZoom} zoom
 * @param {number} delta  +1 next / -1 previous
 */
export function shiftUnit(startMs, zoom, delta) {
	const d = new Date(startMs);
	if (zoom === 'day') return startMs + delta * DAY_MS;
	if (zoom === 'week') return startMs + delta * 7 * DAY_MS;
	if (zoom === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
	return Date.UTC(d.getUTCFullYear() + delta, 0, 1);
}

/**
 * Human label for the current viewport.
 * @param {number} startMs
 * @param {PlanningZoom} zoom
 */
export function unitLabel(startMs, zoom) {
	const d = new Date(startMs);
	if (zoom === 'day') {
		return d.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}
	if (zoom === 'week') {
		const end = new Date(startMs + 6 * DAY_MS);
		const a = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
		const b = end.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
		return `${a} – ${b}`;
	}
	if (zoom === 'month') {
		return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
	}
	return String(d.getUTCFullYear());
}

export const planningView = $state({
	/** @type {PlanningZoom} */
	zoom: /** @type {PlanningZoom} */ ('week'),
	/** Start of visible unit (ms UTC) */
	anchorMs: startOfUnit(Date.now(), 'week')
});

/** @param {PlanningZoom} zoom */
export function setPlanningZoom(zoom) {
	planningView.zoom = zoom;
	planningView.anchorMs = startOfUnit(planningView.anchorMs || Date.now(), zoom);
}

/** @param {number} delta */
export function shiftPlanningAnchor(delta) {
	planningView.anchorMs = shiftUnit(planningView.anchorMs, planningView.zoom, delta);
}
