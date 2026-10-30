/**
 * Accounting browse — Player-style categories in the list column; detail shows the list.
 */

import { buildMetricContext, resolveEnterpriseOutput } from './table-metrics.js';

/** @typedef {'home' | 'ledger' | 'costs' | 'sales' | 'enterprises' | 'tables' | 'metrics' | 'forms'} AccountingMode */

export const ACCOUNTING_MODES = /** @type {const} */ ([
	'enterprises',
	'tables',
	'metrics',
	'forms',
	'costs',
	'sales',
	'ledger'
]);

export const ACCOUNTING_MODE_LABELS = {
	enterprises: 'Entreprises',
	tables: 'Sheets',
	metrics: 'Metrics',
	forms: 'Forms',
	costs: 'Costs',
	sales: 'Sales',
	ledger: 'Ledger'
};

export const accountingBrowse = $state({
	/** @type {AccountingMode} */
	mode: /** @type {AccountingMode} */ ('enterprises')
});

/** @param {AccountingMode} mode */
export function setAccountingBrowse(mode) {
	accountingBrowse.mode = mode;
}

export function resetAccountingBrowse() {
	accountingBrowse.mode = 'enterprises';
}

/**
 * Gross profit for an enterprise sheet given resolved cost/sales catalogs.
 * Optional metrics/tables/rows bind expected output.
 * @param {any} enterprise
 * @param {any[]} costItems
 * @param {any[]} salesLines
 * @param {{ tables?: any[], rows?: any[], metrics?: any[] }} [ops]
 */
export function enterpriseGross(enterprise, costItems, salesLines, ops = {}) {
	const byCost = new Map(costItems.map((c) => [c.id, c]));
	const bySales = new Map(salesLines.map((s) => [s.id, s]));

	const ctx = buildMetricContext(ops.tables || [], ops.rows || [], ops.metrics || []);
	const output = resolveEnterpriseOutput(enterprise, ctx);

	let fixed = 0;
	for (const row of enterprise.fixed_costs ?? []) {
		const item = byCost.get(row.cost_item_id);
		if (!item) continue;
		fixed += (Number(item.amount_cents) || 0) * (Number(row.qty) || 1);
	}

	let variable = 0;
	for (const row of enterprise.variable_costs ?? []) {
		const item = byCost.get(row.cost_item_id);
		if (!item) continue;
		const perOut = Number(row.units_per_output) || 1;
		variable += (Number(item.amount_cents) || 0) * perOut * output;
	}

	let revenue = 0;
	for (const row of enterprise.sales ?? []) {
		const line = bySales.get(row.sales_line_id);
		if (!line) continue;
		revenue += (Number(line.price_cents) || 0) * (Number(row.units) || 0);
	}

	return {
		revenue_cents: Math.round(revenue),
		fixed_cents: Math.round(fixed),
		variable_cents: Math.round(variable),
		gross_cents: Math.round(revenue - fixed - variable),
		output_units: output
	};
}
