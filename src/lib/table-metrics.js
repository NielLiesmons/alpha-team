/**
 * Tiny formula dialect for operational tables / named metrics.
 *
 * Supported:
 *   number literals, + - * / ( )
 *   sum|avg|count|min|max(table:KEY, col:KEY)
 *   metric:dotted.key
 *
 * Tables are resolved by table.key (fallback table.id).
 * Columns by column.key (fallback column.id). Cell values use column.id keys in row.cells.
 */

/**
 * @param {any[]} tables
 * @param {any[]} rows
 * @param {any[]} metrics
 */
export function buildMetricContext(tables, rows, metrics) {
	/** @type {Map<string, any>} */
	const tableByKey = new Map();
	for (const t of tables) {
		if (t.key) tableByKey.set(String(t.key).toLowerCase(), t);
		tableByKey.set(String(t.id).toLowerCase(), t);
	}
	/** @type {Map<string, any[]>} */
	const rowsByTable = new Map();
	for (const r of rows) {
		const tid = r.table_id;
		if (!rowsByTable.has(tid)) rowsByTable.set(tid, []);
		rowsByTable.get(tid).push(r);
	}
	/** @type {Map<string, any>} */
	const metricByKey = new Map();
	/** @type {Map<string, any>} */
	const metricById = new Map();
	for (const m of metrics) {
		metricById.set(m.id, m);
		if (m.key) metricByKey.set(String(m.key).toLowerCase(), m);
	}
	return { tables, rows, metrics, tableByKey, rowsByTable, metricByKey, metricById };
}

/**
 * @param {any} table
 * @param {string} colKey
 */
function columnIdForKey(table, colKey) {
	const k = String(colKey || '').toLowerCase();
	const col = (table.columns || []).find(
		(c) => String(c.key).toLowerCase() === k || String(c.id).toLowerCase() === k
	);
	return col?.id || colKey;
}

/**
 * @param {any} ctx
 * @param {string} tableKey
 * @param {string} colKey
 * @param {'sum' | 'avg' | 'count' | 'min' | 'max'} op
 */
function aggregate(ctx, tableKey, colKey, op) {
	const table = ctx.tableByKey.get(String(tableKey).toLowerCase());
	if (!table) return 0;
	const colId = columnIdForKey(table, colKey);
	const list = ctx.rowsByTable.get(table.id) || [];
	/** @type {number[]} */
	const nums = [];
	for (const row of list) {
		const raw = row.cells?.[colId] ?? row.cells?.[colKey];
		const n = Number(raw);
		if (Number.isFinite(n)) nums.push(n);
	}
	if (op === 'count') return list.length;
	if (!nums.length) return 0;
	if (op === 'sum') return nums.reduce((a, b) => a + b, 0);
	if (op === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
	if (op === 'min') return Math.min(...nums);
	if (op === 'max') return Math.max(...nums);
	return 0;
}

/**
 * Evaluate expr with cycle-safe metric refs.
 * @param {string} expr
 * @param {ReturnType<typeof buildMetricContext>} ctx
 * @param {Set<string>} [stack]
 */
export function evalExpr(expr, ctx, stack = new Set()) {
	let s = String(expr || '0').trim();
	if (!s) return 0;

	s = s.replace(
		/\b(sum|avg|count|min|max)\s*\(\s*table:([a-zA-Z0-9_.-]+)\s*,\s*col:([a-zA-Z0-9_.-]+)\s*\)/gi,
		(_, op, tableKey, colKey) => {
			const v = aggregate(ctx, tableKey, colKey, /** @type {any} */ (op.toLowerCase()));
			return String(v);
		}
	);

	s = s.replace(/\bmetric:([a-zA-Z0-9_.-]+)/gi, (_, key) => {
		const k = String(key).toLowerCase();
		if (stack.has(k)) return '0';
		const m = ctx.metricByKey.get(k) || ctx.metricById.get(key);
		if (!m) return '0';
		const next = new Set(stack);
		next.add(k);
		next.add(String(m.id));
		return String(evalExpr(m.expr, ctx, next));
	});

	if (!/^[\d\s+\-*/().]+$/.test(s)) {
		return 0;
	}
	try {
		// eslint-disable-next-line no-new-func
		const v = Function(`"use strict"; return (${s});`)();
		return Number.isFinite(v) ? Number(v) : 0;
	} catch {
		return 0;
	}
}

/**
 * @param {any} metric
 * @param {ReturnType<typeof buildMetricContext>} ctx
 */
export function evalMetric(metric, ctx) {
	if (!metric) return 0;
	return evalExpr(metric.expr, ctx, new Set([String(metric.id), String(metric.key || '').toLowerCase()]));
}

/**
 * Resolve enterprise output units (metric binding wins when present).
 * @param {any} enterprise
 * @param {ReturnType<typeof buildMetricContext>} ctx
 */
export function resolveEnterpriseOutput(enterprise, ctx) {
	const mid = enterprise?.expected_output_from_metric_id;
	if (mid) {
		const m = ctx.metricById.get(mid);
		if (m) return evalMetric(m, ctx);
	}
	return Number(enterprise?.expected_output_units) || 0;
}
