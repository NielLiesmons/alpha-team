/**
 * Display helpers for metrics / money columns.
 */

/**
 * @param {unknown} value
 * @param {string | null | undefined} unit
 */
export function formatMetricValue(value, unit) {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return '—';
	const u = String(unit || '').trim();
	if (isEurUnit(u)) {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: 'EUR',
			maximumFractionDigits: 2
		}).format(n);
	}
	const num = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
	return u ? `${num} ${u}` : num;
}

/** @param {string} unit */
export function isEurUnit(unit) {
	const u = String(unit || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '');
	return u === 'eur' || u === '€' || u === 'euro' || u === 'euros' || u === 'eur/kg' || u === '€/kg' || u === 'eur/h' || u === '€/h';
}

/**
 * Column header suffix for money / units.
 * @param {string | null | undefined} unit
 */
export function unitSuffix(unit) {
	const u = String(unit || '').trim();
	if (!u) return '';
	if (isEurUnit(u) && (u === 'EUR' || u === '€' || /^euro/i.test(u))) return ' (€)';
	return ` (${u})`;
}
