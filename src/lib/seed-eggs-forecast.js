/**
 * Quietly ensure the Eggs enterprise 2027 simulation exists.
 * No UI affordance — called once after Drive refresh.
 *
 * Scenario: 250 ready-to-lay hens ~Mar 2027, second flock ~Oct 2027.
 * Feed 130 g/hen/day (editable). Layer mash ~€0.38/kg AMA GMO-free → sim €0.40/kg.
 * Labor sim €40/h. DTC packs of 10 + trays of 30.
 */
import {
	appendTableRows,
	captureForms,
	dataTables,
	dataViews,
	deleteTableRows,
	enterprises,
	metrics,
	moments,
	saveCaptureForm,
	saveDataTable,
	saveDataView,
	saveEnterprise,
	saveMetric,
	saveMoment,
	saveTableRow,
	tableRows,
	tasks
} from '$lib/workspace.svelte.js';

const quiet = { select: false };
const SIM = '(simulation 2027)';
const SIM_YEAR = 2027;

/** Editable defaults — also written into egg_params so the family can tweak. */
const DEFAULTS = {
	flock_a_hens: 250,
	flock_a_start: '2027-03-01',
	flock_b_hens: 250,
	flock_b_start: '2027-10-01',
	feed_g_day: 130,
	/**
	 * Organic layer feed (not mill GMO-free mash).
	 * Retail bio pouches often €1.5–€2.9/kg; farm bulk organic mix closer to €0.7–€1.1/kg.
	 * Sim default €0.85/kg — edit in egg_params once you have invoices.
	 */
	feed_eur_kg: 0.85,
	labor_eur_h: 40,
	collect_min_day: 15,
	laying_pct: 80,
	pack10_eur: 4.5,
	tray30_eur: 12.5,
	pack10_share: 0.55,
	tray30_share: 0.45
};

/**
 * @param {any} table
 * @param {Record<string, unknown>} byKey
 */
function cellsFor(table, byKey) {
	/** @type {Record<string, unknown>} */
	const cells = {};
	for (const c of table.columns || []) {
		if (!Object.prototype.hasOwnProperty.call(byKey, c.key)) continue;
		const v = byKey[c.key];
		if (c.id) cells[c.id] = v;
		cells[c.key] = v;
	}
	return cells;
}

/** @param {any} row @param {string} key */
function cell(row, key) {
	return row?.cells?.[key];
}

/** @param {number} year @param {number} month1to12 */
function daysInMonth(year, month1to12) {
	return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Hens present on a given YYYY-MM from flock starts.
 * @param {string} monthYm
 * @param {typeof DEFAULTS} p
 */
function hensInMonth(monthYm, p) {
	let n = 0;
	if (monthYm >= p.flock_a_start.slice(0, 7)) n += p.flock_a_hens;
	if (monthYm >= p.flock_b_start.slice(0, 7)) n += p.flock_b_hens;
	return n;
}

/**
 * @param {typeof DEFAULTS} p
 */
function buildMonthRows(p) {
	/** @type {any[]} */
	const laying = [];
	/** @type {any[]} */
	const feed = [];
	/** @type {any[]} */
	const labor = [];
	/** @type {any[]} */
	const forecast = [];
	/** @type {any[]} */
	const fixed = [];
	/** @type {any[]} */
	const variable = [];

	for (let mo = 3; mo <= 12; mo++) {
		const month = `${SIM_YEAR}-${String(mo).padStart(2, '0')}`;
		const days = daysInMonth(SIM_YEAR, mo);
		const hens = hensInMonth(month, p);
		if (!hens) continue;
		const layingPct = p.laying_pct;
		const eggsDay = Math.round((hens * layingPct) / 100);
		const eggs = eggsDay * days;
		const feedKg = (hens * p.feed_g_day * days) / 1000;
		const feedEur = Math.round(feedKg * p.feed_eur_kg * 100) / 100;
		const collectH = (days * p.collect_min_day) / 60;
		const laborEur = Math.round(collectH * p.labor_eur_h * 100) / 100;
		const pack10Eggs = Math.round(eggs * p.pack10_share);
		const tray30Eggs = eggs - pack10Eggs;
		const packs10 = Math.floor(pack10Eggs / 10);
		const trays30 = Math.floor(tray30Eggs / 30);
		const rev10 = Math.round(packs10 * p.pack10_eur * 100) / 100;
		const rev30 = Math.round(trays30 * p.tray30_eur * 100) / 100;

		laying.push({
			month,
			hens,
			laying_pct: layingPct,
			eggs_day: eggsDay,
			eggs,
			note: hens === p.flock_a_hens ? 'Flock A' : 'Flock A + B'
		});
		feed.push({
			month,
			hens,
			feed_g_day: p.feed_g_day,
			kg: Math.round(feedKg * 10) / 10,
			eur_per_kg: p.feed_eur_kg,
			amount_eur: feedEur
		});
		labor.push({
			month,
			activity: 'Egg collection',
			minutes_day: p.collect_min_day,
			days,
			hours: Math.round(collectH * 100) / 100,
			rate_eur_h: p.labor_eur_h,
			amount_eur: laborEur
		});
		forecast.push({
			month,
			product: 'Pack of 10',
			channel: 'dtc',
			packs: packs10,
			eggs_sold: packs10 * 10,
			revenue_eur: rev10
		});
		forecast.push({
			month,
			product: 'Tray of 30',
			channel: 'dtc',
			packs: trays30,
			eggs_sold: trays30 * 30,
			revenue_eur: rev30
		});
		fixed.push(
			{ month, item: 'Egg mobile depreciation', amount_eur: 180 },
			{ month, item: 'Land / paddock lease share', amount_eur: 90 },
			{ month, item: 'Insurance (flock)', amount_eur: hens >= 400 ? 70 : 45 }
		);
		variable.push(
			{ month, item: 'Feed', amount_eur: feedEur, note: `${Math.round(feedKg)} kg @ €${p.feed_eur_kg}/kg` },
			{ month, item: 'Bedding / litter', amount_eur: hens >= 400 ? 70 : 40, note: '' },
			{
				month,
				item: 'Packaging',
				amount_eur: Math.round((packs10 * 0.12 + trays30 * 0.35) * 100) / 100,
				note: '10s + 30s DTC'
			},
			{ month, item: 'Labour (collection sim)', amount_eur: laborEur, note: `${p.collect_min_day} min/day @ €${p.labor_eur_h}/h` }
		);
	}
	return { laying, feed, labor, forecast, fixed, variable };
}

/**
 * @param {string} title
 * @param {string} key
 * @param {string} enterpriseId
 * @param {{ key: string, label: string, type: string, unit?: string, options?: string[] }[]} columns
 */
async function ensureTable(title, key, enterpriseId, columns) {
	let existing = dataTables.find(
		(t) => t.key === key || (t.enterprise_id === enterpriseId && t.title === title)
	);
	if (existing) {
		const needIds = !(existing.columns || []).every((c) => c?.id && c?.key);
		const needBind = existing.enterprise_id !== enterpriseId || existing.key !== key;
		const needTitle = existing.title !== title;
		const needUnits = columns.some((c) => {
			const cur = (existing.columns || []).find((x) => x.key === c.key);
			return c.unit && cur && cur.unit !== c.unit;
		});
		if (needIds || needBind || needTitle || needUnits) {
			const nextCols = columns.map((c, i) => ({
				id: existing.columns?.find((x) => x.key === c.key)?.id || existing.columns?.[i]?.id || crypto.randomUUID().slice(0, 8),
				...c
			}));
			await saveDataTable(
				{
					...existing,
					title,
					key,
					enterprise_id: enterpriseId,
					columns: nextCols
				},
				false,
				quiet
			);
			existing = dataTables.find((t) => t.id === existing.id) || existing;
		}
		return existing;
	}
	return saveDataTable(
		{ title, key, enterprise_id: enterpriseId, columns, description: '' },
		true,
		quiet
	);
}

/**
 * @param {string} title
 * @param {string} key
 * @param {string} expr
 * @param {string} enterpriseId
 * @param {string} [unit]
 */
async function ensureMetric(title, key, expr, enterpriseId, unit = '') {
	const existing = metrics.find((m) => m.key === key);
	if (existing) {
		await saveMetric(
			{ ...existing, title, key, expr, enterprise_id: enterpriseId, unit: unit || existing.unit || '' },
			false,
			quiet
		);
		return;
	}
	await saveMetric({ title, key, expr, enterprise_id: enterpriseId, unit }, true, quiet);
}

/**
 * Replace rows when sim year missing (upgrade from older seed).
 * @param {any} table
 * @param {Record<string, unknown>[]} rows
 * @param {{ forceYear?: number }} [opts]
 */
async function ensureRows(table, rows, opts = {}) {
	if (!rows.length) return;
	const live = dataTables.find((t) => t.id === table.id) || table;
	const existing = tableRows.filter((r) => r.table_id === live.id);
	const year = opts.forceYear;
	const hasYear =
		!year ||
		existing.some((r) => {
			const m = String(cell(r, 'month') || cell(r, 'date') || '');
			return m.startsWith(String(year));
		});
	if (hasYear && existing.length && rowsHaveValues(live, existing)) return;
	if (existing.length) await deleteTableRows(existing.map((r) => r.id));
	await appendTableRows(
		rows.map((row) => ({
			table_id: live.id,
			cells: cellsFor(live, row),
			occurred_on: typeof row.date === 'string' ? row.date : undefined
		}))
	);
}

/** @param {any} table @param {any[]} rows */
function rowsHaveValues(table, rows) {
	if (!rows.length) return false;
	const keys = (table.columns || []).flatMap((c) => [c.id, c.key].filter(Boolean));
	if (!keys.length) return false;
	return rows.some((r) => {
		const cells = r.cells || {};
		return keys.some((k) => {
			const v = cells[k];
			return v !== undefined && v !== null && v !== '';
		});
	});
}

/**
 * Bump legacy €0.40/kg (conventional mash) → organic estimate; force plan rebuild.
 * @param {any} table
 */
async function migrateLegacyFeedPrice(table) {
	const live = dataTables.find((t) => t.id === table.id) || table;
	const rows = tableRows.filter((r) => r.table_id === live.id);
	const feed = rows.find((r) => String(cell(r, 'key')) === 'feed_eur_kg');
	if (!feed) return;
	const v = Number(cell(feed, 'value'));
	if (v !== 0.4) return;
	const cells = {
		...feed.cells,
		value: DEFAULTS.feed_eur_kg,
		note: 'Organic farm bulk estimate (was €0.40 conventional mash)'
	};
	if (feed.cells) {
		for (const c of live.columns || []) {
			if (c.key === 'value' && c.id) cells[c.id] = DEFAULTS.feed_eur_kg;
			if (c.key === 'note' && c.id) cells[c.id] = cells.note;
		}
	}
	await saveTableRow({ ...feed, cells });
	/* Drop 2027 plan rows so ensureRows rewrites with the new price. */
	const planKeys = new Set([
		'egg_feed_plan',
		'egg_variable_costs',
		'egg_labor_plan',
		'egg_laying',
		'egg_sales_forecast',
		'egg_fixed_costs'
	]);
	const doomed = tableRows.filter((r) => {
		const t = dataTables.find((x) => x.id === r.table_id);
		return t && planKeys.has(String(t.key));
	});
	if (doomed.length) await deleteTableRows(doomed.map((r) => r.id));
}

/**
 * Params table: upsert by `key` column so edits stick across ensures.
 * @param {any} table
 * @param {{ key: string, value: string | number, unit?: string, note?: string }[]} rows
 */
async function ensureParamRows(table, rows) {
	const live = dataTables.find((t) => t.id === table.id) || table;
	const existing = tableRows.filter((r) => r.table_id === live.id);
	const byKey = new Map(existing.map((r) => [String(cell(r, 'key') || ''), r]));
	/** @type {Record<string, unknown>[]} */
	const toAdd = [];
	for (const row of rows) {
		const cur = byKey.get(row.key);
		if (cur) continue;
		toAdd.push(row);
	}
	if (toAdd.length) {
		await appendTableRows(
			toAdd.map((row) => ({
				table_id: live.id,
				cells: cellsFor(live, row)
			}))
		);
	}
}

/**
 * Read editable params (fall back to DEFAULTS).
 * @param {any} table
 */
function readParams(table) {
	const live = dataTables.find((t) => t.id === table.id) || table;
	const rows = tableRows.filter((r) => r.table_id === live.id);
	/** @type {Record<string, string | number>} */
	const map = { ...DEFAULTS };
	for (const r of rows) {
		const k = String(cell(r, 'key') || '');
		if (!k) continue;
		const raw = cell(r, 'value');
		if (raw === undefined || raw === null || raw === '') continue;
		const num = Number(raw);
		map[k] = Number.isFinite(num) && String(raw).trim() !== '' && !String(raw).includes('-')
			? num
			: /** @type {any} */ (raw);
		/* dates like 2027-03-01 should stay strings */
		if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) map[k] = String(raw);
	}
	return {
		flock_a_hens: Number(map.flock_a_hens) || DEFAULTS.flock_a_hens,
		flock_a_start: String(map.flock_a_start || DEFAULTS.flock_a_start),
		flock_b_hens: Number(map.flock_b_hens) || DEFAULTS.flock_b_hens,
		flock_b_start: String(map.flock_b_start || DEFAULTS.flock_b_start),
		feed_g_day: Number(map.feed_g_day) || DEFAULTS.feed_g_day,
		feed_eur_kg: Number(map.feed_eur_kg) || DEFAULTS.feed_eur_kg,
		labor_eur_h: Number(map.labor_eur_h) || DEFAULTS.labor_eur_h,
		collect_min_day: Number(map.collect_min_day) || DEFAULTS.collect_min_day,
		laying_pct: Number(map.laying_pct) || DEFAULTS.laying_pct,
		pack10_eur: Number(map.pack10_eur) || DEFAULTS.pack10_eur,
		tray30_eur: Number(map.tray30_eur) || DEFAULTS.tray30_eur,
		pack10_share: Number(map.pack10_share) || DEFAULTS.pack10_share,
		tray30_share: Number(map.tray30_share) || DEFAULTS.tray30_share
	};
}

/** Daily egg-collection series on the existing task (one Drive leaf). */
async function ensureCollectionSeries() {
	const task =
		tasks.find((t) => /egg\s*collect/i.test(String(t.title || ''))) ||
		tasks.find((t) => /collect.*egg/i.test(String(t.title || '')));
	if (!task) return;

	const existing = moments.find(
		(m) => m.task_id === task.id && m.recurrence?.freq === 'daily' && /collect/i.test(String(m.title || task.title || ''))
	);
	if (existing) return;

	const already = moments.find((m) => m.task_id === task.id && m.recurrence?.freq === 'daily');
	if (already) return;

	await saveMoment(
		{
			task_id: task.id,
			title: task.title || 'Egg collection',
			start_at: `${DEFAULTS.flock_a_start}T14:00:00.000Z`,
			end_at: `${DEFAULTS.flock_a_start}T14:15:00.000Z`,
			status: 'planned',
			assignees: [],
			recurrence: {
				freq: 'daily',
				interval: 1,
				local_start: '15:00',
				local_end: '15:15',
				timezone: 'Europe/Brussels',
				until: '2027-12-31T23:00:00.000Z'
			}
		},
		true
	);
}

let ensurePromise = /** @type {Promise<{ enterpriseId: string, tableIds: string[] } | null> | null} */ (
	null
);

/**
 * Idempotent Eggs example — safe to call after every Drive refresh.
 * @returns {Promise<{ enterpriseId: string, tableIds: string[] } | null>}
 */
export async function ensureEggsExample() {
	if (ensurePromise) return ensurePromise;
	ensurePromise = (async () => {
		try {
			return await runEnsure();
		} finally {
			ensurePromise = null;
		}
	})();
	return ensurePromise;
}

/** @deprecated use ensureEggsExample */
export const seedEggsForecast = ensureEggsExample;

async function runEnsure() {
	let ent = enterprises.find((e) =>
		String(e.title || '')
			.toLowerCase()
			.includes('egg')
	);

	const eggsDesc =
		'Pastured eggs — 250 RTL Mar 2027 + second flock Oct 2027. Edit egg_params for feed g/day, €/kg, labour €/h.';

	if (!ent) {
		ent = await saveEnterprise(
			{
				title: 'Eggs',
				description: eggsDesc,
				status: 'active',
				kind: 'activity',
				icon: '🥚',
				sort: 10,
				output_unit_label: 'eggs',
				currency: 'EUR',
				table_ids: []
			},
			true
		);
	} else if (!String(ent.description || ent.body || '').trim()) {
		/* Older Eggs docs sometimes lack description — restore before table work */
		ent = await saveEnterprise(
			{
				...ent,
				description: eggsDesc,
				icon: ent.icon || '🥚',
				output_unit_label: ent.output_unit_label || 'eggs'
			},
			false
		);
	}

	const enterpriseId = ent.id;

	const params = await ensureTable(`Simulation params ${SIM}`, 'egg_params', enterpriseId, [
		{ key: 'key', label: 'Param', type: 'text' },
		{ key: 'value', label: 'Value', type: 'text' },
		{ key: 'unit', label: 'Unit', type: 'text' },
		{ key: 'note', label: 'Note', type: 'text' }
	]);

	await migrateLegacyFeedPrice(params);
	await ensureParamRows(params, [
		{ key: 'flock_a_hens', value: DEFAULTS.flock_a_hens, unit: 'hens', note: 'Ready-to-lay flock A' },
		{ key: 'flock_a_start', value: DEFAULTS.flock_a_start, unit: 'date', note: 'Feb/Mar 2027 arrival' },
		{ key: 'flock_b_hens', value: DEFAULTS.flock_b_hens, unit: 'hens', note: 'Second flock autumn' },
		{ key: 'flock_b_start', value: DEFAULTS.flock_b_start, unit: 'date', note: 'Autumn 2027' },
		{
			key: 'feed_g_day',
			value: DEFAULTS.feed_g_day,
			unit: 'g',
			note: 'Intake per hen per day — edit me'
		},
		{
			key: 'feed_eur_kg',
			value: DEFAULTS.feed_eur_kg,
			unit: 'EUR/kg',
			note: 'Organic farm bulk estimate; retail bio bags much higher (~€2/kg)'
		},
		{ key: 'labor_eur_h', value: DEFAULTS.labor_eur_h, unit: 'EUR/h', note: 'Simulated salary rate' },
		{ key: 'collect_min_day', value: DEFAULTS.collect_min_day, unit: 'min', note: 'Afternoon collection' },
		{ key: 'laying_pct', value: DEFAULTS.laying_pct, unit: '%', note: 'Average lay rate' },
		{ key: 'pack10_eur', value: DEFAULTS.pack10_eur, unit: 'EUR', note: 'DTC pack of 10' },
		{ key: 'tray30_eur', value: DEFAULTS.tray30_eur, unit: 'EUR', note: 'DTC tray of 30' },
		{ key: 'pack10_share', value: DEFAULTS.pack10_share, unit: 'share', note: 'Eggs sold as 10s' },
		{ key: 'tray30_share', value: DEFAULTS.tray30_share, unit: 'share', note: 'Eggs sold as 30s' }
	]);

	const p = readParams(params);
	const built = buildMonthRows(p);

	const rates = await ensureTable(`Labour rates ${SIM}`, 'egg_labor_rates', enterpriseId, [
		{ key: 'person', label: 'Person', type: 'text' },
		{ key: 'role', label: 'Role', type: 'text' },
		{ key: 'rate_eur_h', label: 'Rate', type: 'number', unit: 'EUR' }
	]);
	const laborLog = await ensureTable('Labour log', 'egg_labor_log', enterpriseId, [
		{ key: 'date', label: 'Date', type: 'date' },
		{ key: 'person', label: 'Person', type: 'text' },
		{ key: 'activity', label: 'Activity', type: 'text' },
		{ key: 'minutes', label: 'Minutes', type: 'number', unit: 'min' },
		{ key: 'note', label: 'Note', type: 'text' }
	]);
	const laborPlan = await ensureTable(`Labour plan ${SIM}`, 'egg_labor_plan', enterpriseId, [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'activity', label: 'Activity', type: 'text' },
		{ key: 'minutes_day', label: 'Min / day', type: 'number' },
		{ key: 'days', label: 'Days', type: 'number' },
		{ key: 'hours', label: 'Hours', type: 'number' },
		{ key: 'rate_eur_h', label: 'Rate', type: 'number', unit: 'EUR' },
		{ key: 'amount_eur', label: 'Cost', type: 'number', unit: 'EUR' }
	]);
	const feedPlan = await ensureTable(`Feed plan ${SIM}`, 'egg_feed_plan', enterpriseId, [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'hens', label: 'Hens', type: 'number' },
		{ key: 'feed_g_day', label: 'g / hen / day', type: 'number', unit: 'g' },
		{ key: 'kg', label: 'kg', type: 'number' },
		{ key: 'eur_per_kg', label: '€ / kg', type: 'number', unit: 'EUR' },
		{ key: 'amount_eur', label: 'Cost', type: 'number', unit: 'EUR' }
	]);
	const fixed = await ensureTable(`Fixed costs ${SIM}`, 'egg_fixed_costs', enterpriseId, [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'item', label: 'Item', type: 'text' },
		{ key: 'amount_eur', label: 'Amount', type: 'number', unit: 'EUR' }
	]);
	const variable = await ensureTable(`Variable costs ${SIM}`, 'egg_variable_costs', enterpriseId, [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'item', label: 'Item', type: 'text' },
		{ key: 'amount_eur', label: 'Amount', type: 'number', unit: 'EUR' },
		{ key: 'note', label: 'Note', type: 'text' }
	]);
	const laying = await ensureTable(`Egg laying ${SIM}`, 'egg_laying', enterpriseId, [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'hens', label: 'Hens', type: 'number' },
		{ key: 'laying_pct', label: 'Laying %', type: 'number', unit: '%' },
		{ key: 'eggs_day', label: 'Eggs / day', type: 'number' },
		{ key: 'eggs', label: 'Eggs / month', type: 'number' },
		{ key: 'note', label: 'Note', type: 'text' }
	]);
	const prices = await ensureTable(`Sales prices ${SIM}`, 'egg_prices', enterpriseId, [
		{ key: 'product', label: 'Product', type: 'text' },
		{ key: 'pack_size', label: 'Pack size', type: 'number', unit: 'eggs' },
		{ key: 'channel', label: 'Channel', type: 'select', options: ['dtc', 'retail', 'wholesale'] },
		{ key: 'price_eur', label: 'Price', type: 'number', unit: 'EUR' }
	]);
	const forecast = await ensureTable(`Sales forecast ${SIM}`, 'egg_sales_forecast', enterpriseId, [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'product', label: 'Product', type: 'text' },
		{ key: 'channel', label: 'Channel', type: 'select', options: ['dtc', 'retail', 'wholesale'] },
		{ key: 'packs', label: 'Packs', type: 'number' },
		{ key: 'eggs_sold', label: 'Eggs sold', type: 'number' },
		{ key: 'revenue_eur', label: 'Revenue', type: 'number', unit: 'EUR' }
	]);
	const actuals = await ensureTable('Daily egg log', 'egg_actuals', enterpriseId, [
		{ key: 'date', label: 'Date', type: 'date' },
		{ key: 'eggs', label: 'Eggs', type: 'number' },
		{ key: 'note', label: 'Note', type: 'text' }
	]);

	{
		const rateRows = tableRows.filter((r) => r.table_id === rates.id);
		if (!rateRows.length) {
			await ensureRows(rates, [
				{ person: 'Niel', role: 'Operator', rate_eur_h: p.labor_eur_h },
				{ person: 'Wife', role: 'Operator', rate_eur_h: p.labor_eur_h }
			]);
		}
	}
	/* Labour log stays empty for real time tracking (Capture → Log labour). */
	void laborLog;
	await ensureRows(laborPlan, built.labor, { forceYear: SIM_YEAR });
	await ensureRows(feedPlan, built.feed, { forceYear: SIM_YEAR });
	await ensureRows(fixed, built.fixed, { forceYear: SIM_YEAR });
	await ensureRows(variable, built.variable, { forceYear: SIM_YEAR });
	await ensureRows(laying, built.laying, { forceYear: SIM_YEAR });
	{
		const priceRows = tableRows.filter((r) => r.table_id === prices.id);
		const hasDtc = priceRows.some((r) => String(cell(r, 'channel')) === 'dtc');
		if (priceRows.length && !hasDtc) await deleteTableRows(priceRows.map((r) => r.id));
		await ensureRows(prices, [
			{ product: 'Pack of 10', pack_size: 10, channel: 'dtc', price_eur: p.pack10_eur },
			{ product: 'Tray of 30', pack_size: 30, channel: 'dtc', price_eur: p.tray30_eur }
		]);
	}
	await ensureRows(forecast, built.forecast, { forceYear: SIM_YEAR });

	await ensureMetric(`Eggs laid ${SIM}`, 'eggs.laying_total', 'sum(table:egg_laying, col:eggs)', enterpriseId, 'eggs');
	await ensureMetric(
		`Fixed costs ${SIM}`,
		'eggs.fixed_total',
		'sum(table:egg_fixed_costs, col:amount_eur)',
		enterpriseId,
		'EUR'
	);
	await ensureMetric(
		`Variable costs ${SIM}`,
		'eggs.variable_total',
		'sum(table:egg_variable_costs, col:amount_eur)',
		enterpriseId,
		'EUR'
	);
	await ensureMetric(
		`Feed cost ${SIM}`,
		'eggs.feed_total',
		'sum(table:egg_feed_plan, col:amount_eur)',
		enterpriseId,
		'EUR'
	);
	await ensureMetric(
		`Labour cost (plan) ${SIM}`,
		'eggs.labor_plan_total',
		'sum(table:egg_labor_plan, col:amount_eur)',
		enterpriseId,
		'EUR'
	);
	await ensureMetric(
		`Sales revenue ${SIM}`,
		'eggs.revenue_total',
		'sum(table:egg_sales_forecast, col:revenue_eur)',
		enterpriseId,
		'EUR'
	);
	await ensureMetric(
		`Gross (rev − fixed − variable) ${SIM}`,
		'eggs.gross_total',
		'metric:eggs.revenue_total - metric:eggs.fixed_total - metric:eggs.variable_total',
		enterpriseId,
		'EUR'
	);
	await ensureMetric(
		'Daily log eggs',
		'eggs.actual_log',
		'sum(table:egg_actuals, col:eggs)',
		enterpriseId,
		'eggs'
	);

	const liveActuals = dataTables.find((t) => t.id === actuals.id) || actuals;
	if (!captureForms.some((f) => f.table_id === liveActuals.id)) {
		await saveCaptureForm(
			{
				title: 'Log eggs',
				table_id: liveActuals.id,
				enterprise_id: enterpriseId,
				fields: (liveActuals.columns || []).map((c) => ({
					column_key: c.key,
					required: c.key !== 'note',
					default: c.type === 'date' ? 'today' : undefined
				}))
			},
			true,
			quiet
		);
	}

	const liveLaborLog = dataTables.find((t) => t.id === laborLog.id) || laborLog;
	if (!captureForms.some((f) => f.table_id === liveLaborLog.id)) {
		await saveCaptureForm(
			{
				title: 'Log labour',
				table_id: liveLaborLog.id,
				enterprise_id: enterpriseId,
				fields: (liveLaborLog.columns || []).map((c) => ({
					column_key: c.key,
					required: c.key !== 'note',
					default: c.type === 'date' ? 'today' : undefined
				}))
			},
			true,
			quiet
		);
	}

	const tableIds = [
		params,
		rates,
		laborLog,
		laborPlan,
		feedPlan,
		fixed,
		variable,
		laying,
		prices,
		forecast,
		actuals
	].map((t) => t.id);

	const simMetricIds = [
		'eggs.gross_total',
		'eggs.revenue_total',
		'eggs.feed_total',
		'eggs.labor_plan_total',
		'eggs.fixed_total',
		'eggs.variable_total',
		'eggs.laying_total'
	]
		.map((k) => metrics.find((m) => m.key === k)?.id)
		.filter(Boolean);

	const simTableIds = [
		params,
		rates,
		laborPlan,
		feedPlan,
		fixed,
		variable,
		laying,
		prices,
		forecast
	].map((t) => t.id);

	const viewTitle = `Eggs forecast ${SIM}`;
	let view = dataViews.find(
		(v) => v.enterprise_id === enterpriseId && (v.title === viewTitle || v.title?.includes('forecast'))
	);
	if (!view) {
		view = await saveDataView(
			{
				title: viewTitle,
				description:
					'2027 simulation — params, flocks, feed, labour @ €40/h, DTC packs of 10 & trays of 30.',
				enterprise_id: enterpriseId,
				table_ids: simTableIds,
				metric_ids: simMetricIds
			},
			true,
			quiet
		);
	} else {
		await saveDataView(
			{
				...view,
				title: viewTitle,
				table_ids: [...new Set([...simTableIds, ...(view.table_ids || [])])],
				/* Prefer sim order (gross first); keep any extras at the end. */
				metric_ids: [
					...simMetricIds,
					...(view.metric_ids || []).filter((id) => !simMetricIds.includes(id))
				]
			},
			false,
			quiet
		);
	}

	const layingMetric = metrics.find((m) => m.key === 'eggs.laying_total');
	const liveEnt = enterprises.find((e) => e.id === enterpriseId) || ent;
	await saveEnterprise(
		{
			...liveEnt,
			table_ids: [...new Set([...(liveEnt.table_ids || []), ...tableIds])],
			expected_output_from_metric_id:
				layingMetric?.id || liveEnt.expected_output_from_metric_id || null,
			description: String(liveEnt.description || '').trim() || eggsDesc,
			icon: liveEnt.icon || '🥚',
			output_unit_label: liveEnt.output_unit_label || 'eggs',
			currency: 'EUR'
		},
		false
	);

	try {
		await ensureCollectionSeries();
	} catch (e) {
		console.warn('ensureCollectionSeries', e);
	}

	return { enterpriseId, tableIds };
}
