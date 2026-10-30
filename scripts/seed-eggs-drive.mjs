/**
 * Seed Eggs forecast overview onto a Drive (local or prod).
 * Usage:
 *   node scripts/seed-eggs-drive.mjs
 * Env: ALPHA_DRIVE_URL, ALPHA_DRIVE_TOKEN, ALPHA_DRIVE_ROOT_KEY
 * Or reads /tmp/alpha-drive-eggs.env from local prove run.
 */
import { readFileSync, existsSync } from 'node:fs';
import {
	createEnterprise,
	createForm,
	createMetric,
	createTable,
	createTableRow,
	listEnterprises,
	listMetrics,
	listTableRows,
	listTables,
	putEnterprise
} from '../src/lib/drive/entities.js';

function loadEnv() {
	const fromFile = '/tmp/alpha-drive-eggs.env';
	if (existsSync(fromFile)) {
		for (const line of readFileSync(fromFile, 'utf8').split('\n')) {
			const m = line.match(/^(ROOT|TOKEN|URL)=(.*)$/);
			if (!m) continue;
			if (m[1] === 'ROOT' && !process.env.ALPHA_DRIVE_ROOT_KEY)
				process.env.ALPHA_DRIVE_ROOT_KEY = m[2];
			if (m[1] === 'TOKEN' && !process.env.ALPHA_DRIVE_TOKEN)
				process.env.ALPHA_DRIVE_TOKEN = m[2];
			if (m[1] === 'URL' && !process.env.ALPHA_DRIVE_URL) process.env.ALPHA_DRIVE_URL = m[2];
		}
	}
}

function cellsFor(table, byKey) {
	const cells = {};
	for (const c of table.columns || []) {
		if (Object.prototype.hasOwnProperty.call(byKey, c.key)) cells[c.id] = byKey[c.key];
	}
	return cells;
}

async function ensureTable(session, enterpriseId, title, key, columns) {
	const tables = await listTables(session);
	let t = tables.find((x) => x.key === key);
	if (t) return t;
	return createTable(session, { title, key, enterprise_id: enterpriseId, columns });
}

async function ensureMetric(session, enterpriseId, title, key, expr) {
	const all = await listMetrics(session);
	if (all.some((m) => m.key === key)) return;
	await createMetric(session, { title, key, expr, enterprise_id: enterpriseId });
}

async function seedRowsIfEmpty(session, table, rows) {
	const existing = await listTableRows(session, table.id);
	if (existing.length) return 0;
	for (const row of rows) {
		await createTableRow(session, {
			table_id: table.id,
			cells: cellsFor(table, row),
			occurred_on: typeof row.date === 'string' ? row.date : undefined
		});
	}
	return rows.length;
}

async function main() {
	loadEnv();
	const url = (process.env.ALPHA_DRIVE_URL || '').replace(/\/$/, '');
	const token = process.env.ALPHA_DRIVE_TOKEN || '';
	const rootKey = process.env.ALPHA_DRIVE_ROOT_KEY || '';
	if (!url || !token || !rootKey) {
		console.error('Need ALPHA_DRIVE_URL, ALPHA_DRIVE_TOKEN, ALPHA_DRIVE_ROOT_KEY');
		process.exit(1);
	}
	const session = { url, token, rootKey };

	const ents = await listEnterprises(session);
	let ent = ents.find((e) => String(e.title || '').toLowerCase().includes('egg'));
	if (!ent) {
		ent = await createEnterprise(session, {
			title: 'Eggs',
			description:
				'Pastured egg enterprise — sheets for fixed/variable costs, laying, prices, and sales forecast.',
			status: 'active',
			kind: 'activity',
			icon: '🥚',
			sort: 10,
			output_unit_label: 'eggs',
			currency: 'EUR'
		});
		console.log('created enterprise', ent.id);
	} else {
		console.log('using enterprise', ent.id, ent.title);
	}

	const eid = ent.id;
	const fixed = await ensureTable(session, eid, 'Fixed costs', 'egg_fixed_costs', [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'item', label: 'Item', type: 'text' },
		{ key: 'amount_eur', label: 'Amount', type: 'number', unit: 'EUR' }
	]);
	const variable = await ensureTable(session, eid, 'Variable costs', 'egg_variable_costs', [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'item', label: 'Item', type: 'text' },
		{ key: 'amount_eur', label: 'Amount', type: 'number', unit: 'EUR' },
		{ key: 'note', label: 'Note', type: 'text' }
	]);
	const laying = await ensureTable(session, eid, 'Egg laying', 'egg_laying', [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'hens', label: 'Hens', type: 'number' },
		{ key: 'laying_pct', label: 'Laying %', type: 'number', unit: '%' },
		{ key: 'eggs_day', label: 'Eggs / day', type: 'number' },
		{ key: 'eggs', label: 'Eggs / month', type: 'number' }
	]);
	const prices = await ensureTable(session, eid, 'Sales prices', 'egg_prices', [
		{ key: 'product', label: 'Product', type: 'text' },
		{ key: 'pack_size', label: 'Pack size', type: 'number', unit: 'eggs' },
		{ key: 'channel', label: 'Channel', type: 'select', options: ['retail', 'wholesale'] },
		{ key: 'price_eur', label: 'Price', type: 'number', unit: 'EUR' }
	]);
	const forecast = await ensureTable(session, eid, 'Sales forecast', 'egg_sales_forecast', [
		{ key: 'month', label: 'Month', type: 'text' },
		{ key: 'product', label: 'Product', type: 'text' },
		{ key: 'channel', label: 'Channel', type: 'select', options: ['retail', 'wholesale'] },
		{ key: 'packs', label: 'Packs', type: 'number' },
		{ key: 'eggs_sold', label: 'Eggs sold', type: 'number' },
		{ key: 'revenue_eur', label: 'Revenue', type: 'number', unit: 'EUR' }
	]);
	const actuals = await ensureTable(session, eid, 'Daily egg log', 'egg_actuals', [
		{ key: 'date', label: 'Date', type: 'date' },
		{ key: 'eggs', label: 'Eggs', type: 'number' },
		{ key: 'note', label: 'Note', type: 'text' }
	]);

	const n1 = await seedRowsIfEmpty(session, fixed, [
		{ month: '2026-01', item: 'Egg mobile depreciation', amount_eur: 180 },
		{ month: '2026-01', item: 'Land / paddock lease share', amount_eur: 90 },
		{ month: '2026-01', item: 'Insurance (flock)', amount_eur: 45 },
		{ month: '2026-02', item: 'Egg mobile depreciation', amount_eur: 180 },
		{ month: '2026-02', item: 'Land / paddock lease share', amount_eur: 90 },
		{ month: '2026-02', item: 'Insurance (flock)', amount_eur: 45 },
		{ month: '2026-03', item: 'Egg mobile depreciation', amount_eur: 180 },
		{ month: '2026-03', item: 'Land / paddock lease share', amount_eur: 90 },
		{ month: '2026-03', item: 'Insurance (flock)', amount_eur: 45 }
	]);
	const n2 = await seedRowsIfEmpty(session, variable, [
		{ month: '2026-01', item: 'Feed', amount_eur: 620, note: '~2.1t organic mash' },
		{ month: '2026-01', item: 'Bedding / litter', amount_eur: 40, note: '' },
		{ month: '2026-01', item: 'Packaging (boxes)', amount_eur: 95, note: '10s + 30s' },
		{ month: '2026-02', item: 'Feed', amount_eur: 640, note: '' },
		{ month: '2026-02', item: 'Bedding / litter', amount_eur: 40, note: '' },
		{ month: '2026-02', item: 'Packaging (boxes)', amount_eur: 110, note: '' },
		{ month: '2026-03', item: 'Feed', amount_eur: 660, note: 'spring ramp' },
		{ month: '2026-03', item: 'Bedding / litter', amount_eur: 45, note: '' },
		{ month: '2026-03', item: 'Packaging (boxes)', amount_eur: 125, note: '' }
	]);
	const n3 = await seedRowsIfEmpty(session, laying, [
		{ month: '2026-01', hens: 320, laying_pct: 78, eggs_day: 250, eggs: 7750 },
		{ month: '2026-02', hens: 320, laying_pct: 80, eggs_day: 256, eggs: 7170 },
		{ month: '2026-03', hens: 340, laying_pct: 82, eggs_day: 279, eggs: 8640 },
		{ month: '2026-04', hens: 340, laying_pct: 84, eggs_day: 286, eggs: 8580 },
		{ month: '2026-05', hens: 360, laying_pct: 85, eggs_day: 306, eggs: 9480 },
		{ month: '2026-06', hens: 360, laying_pct: 84, eggs_day: 302, eggs: 9070 }
	]);
	const n4 = await seedRowsIfEmpty(session, prices, [
		{ product: 'Box of 10', pack_size: 10, channel: 'retail', price_eur: 4.5 },
		{ product: 'Box of 30', pack_size: 30, channel: 'retail', price_eur: 12.5 },
		{ product: 'Tray of 30', pack_size: 30, channel: 'wholesale', price_eur: 9.0 },
		{ product: 'Flat of 30 × 12', pack_size: 360, channel: 'wholesale', price_eur: 95 },
		{ product: 'Loose dozen', pack_size: 12, channel: 'retail', price_eur: 5.2 }
	]);
	const n5 = await seedRowsIfEmpty(session, forecast, [
		{ month: '2026-01', product: 'Box of 10', channel: 'retail', packs: 220, eggs_sold: 2200, revenue_eur: 990 },
		{ month: '2026-01', product: 'Box of 30', channel: 'retail', packs: 80, eggs_sold: 2400, revenue_eur: 1000 },
		{ month: '2026-01', product: 'Tray of 30', channel: 'wholesale', packs: 70, eggs_sold: 2100, revenue_eur: 630 },
		{ month: '2026-02', product: 'Box of 10', channel: 'retail', packs: 200, eggs_sold: 2000, revenue_eur: 900 },
		{ month: '2026-02', product: 'Box of 30', channel: 'retail', packs: 75, eggs_sold: 2250, revenue_eur: 937.5 },
		{ month: '2026-02', product: 'Tray of 30', channel: 'wholesale', packs: 65, eggs_sold: 1950, revenue_eur: 585 },
		{ month: '2026-03', product: 'Box of 10', channel: 'retail', packs: 240, eggs_sold: 2400, revenue_eur: 1080 },
		{ month: '2026-03', product: 'Box of 30', channel: 'retail', packs: 90, eggs_sold: 2700, revenue_eur: 1125 },
		{ month: '2026-03', product: 'Tray of 30', channel: 'wholesale', packs: 85, eggs_sold: 2550, revenue_eur: 765 },
		{ month: '2026-03', product: 'Loose dozen', channel: 'retail', packs: 40, eggs_sold: 480, revenue_eur: 208 }
	]);
	const n6 = await seedRowsIfEmpty(session, actuals, [
		{ date: '2026-03-20', eggs: 268, note: 'sunny' },
		{ date: '2026-03-21', eggs: 275, note: '' },
		{ date: '2026-03-22', eggs: 271, note: 'rain' },
		{ date: '2026-03-23', eggs: 280, note: '' },
		{ date: '2026-03-24', eggs: 277, note: '' }
	]);

	await ensureMetric(session, eid, 'Eggs laid (forecast months)', 'eggs.laying_total', 'sum(table:egg_laying, col:eggs)');
	await ensureMetric(session, eid, 'Fixed costs total', 'eggs.fixed_total', 'sum(table:egg_fixed_costs, col:amount_eur)');
	await ensureMetric(session, eid, 'Variable costs total', 'eggs.variable_total', 'sum(table:egg_variable_costs, col:amount_eur)');
	await ensureMetric(session, eid, 'Sales revenue total', 'eggs.revenue_total', 'sum(table:egg_sales_forecast, col:revenue_eur)');
	await ensureMetric(
		session,
		eid,
		'Gross (rev − fixed − variable)',
		'eggs.gross_total',
		'metric:eggs.revenue_total - metric:eggs.fixed_total - metric:eggs.variable_total'
	);
	await ensureMetric(session, eid, 'Daily log eggs', 'eggs.actual_log', 'sum(table:egg_actuals, col:eggs)');

	const metrics = await listMetrics(session);
	const layingMetric = metrics.find((m) => m.key === 'eggs.laying_total');
	const tableIds = [fixed, variable, laying, prices, forecast, actuals].map((t) => t.id);
	await putEnterprise(session, {
		...ent,
		table_ids: [...new Set([...(ent.table_ids || []), ...tableIds])],
		expected_output_from_metric_id: layingMetric?.id || ent.expected_output_from_metric_id || null,
		description:
			ent.description ||
			'Pastured egg enterprise — sheets for fixed/variable costs, laying, prices, and sales forecast.',
		icon: ent.icon || '🥚'
	});

	await createForm(session, {
		title: 'Log eggs',
		table_id: actuals.id,
		enterprise_id: eid,
		fields: (actuals.columns || []).map((c) => ({
			column_key: c.key,
			required: c.key !== 'note',
			default: c.type === 'date' ? 'today' : undefined
		}))
	}).catch(() => {});

	const tables = await listTables(session);
	const eggTables = tables.filter((t) => t.enterprise_id === eid);
	console.log(
		JSON.stringify(
			{
				ok: true,
				enterpriseId: eid,
				sheets: eggTables.map((t) => ({ key: t.key, title: t.title, cols: t.columns?.length })),
				rowsAdded: n1 + n2 + n3 + n4 + n5 + n6,
				metrics: (await listMetrics(session)).filter((m) => m.enterprise_id === eid).map((m) => m.key)
			},
			null,
			2
		)
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
