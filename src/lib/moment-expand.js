/**
 * Expand alpha.moment recurrence templates into range-local instances.
 * Series stay as one Drive leaf; Planning paints virtual occurrences.
 */

const DAY_MS = 86_400_000;

/**
 * @param {string} iso
 * @param {number} fallback
 */
function parseMs(iso, fallback = NaN) {
	if (!iso) return fallback;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : fallback;
}

/**
 * Local calendar Y-M-D in a timezone (fallback: UTC date of instant).
 * @param {number} ms
 * @param {string} [tz]
 */
function ymdInTz(ms, tz) {
	try {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz || 'UTC',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(new Date(ms));
		const y = parts.find((p) => p.type === 'year')?.value;
		const m = parts.find((p) => p.type === 'month')?.value;
		const d = parts.find((p) => p.type === 'day')?.value;
		if (y && m && d) return `${y}-${m}-${d}`;
	} catch {
		/* ignore */
	}
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @param {string} ymd
 * @param {string} hhmm
 * @param {string} [tz]
 */
function localToUtcIso(ymd, hhmm, tz) {
	const [y, mo, d] = ymd.split('-').map(Number);
	const [hh, mm] = String(hhmm || '12:00')
		.split(':')
		.map(Number);
	if (!tz || tz === 'UTC') {
		return new Date(Date.UTC(y, mo - 1, d, hh || 0, mm || 0, 0)).toISOString();
	}
	/* Approximate: build as UTC then shift by offset at that local wall time. */
	const guess = Date.UTC(y, mo - 1, d, hh || 0, mm || 0, 0);
	try {
		const fmt = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		});
		const parts = fmt.formatToParts(new Date(guess));
		const get = (t) => Number(parts.find((p) => p.type === t)?.value);
		const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
		const offset = asUtc - guess;
		return new Date(guess - offset).toISOString();
	} catch {
		return new Date(guess).toISOString();
	}
}

/**
 * Weekday key mo…su for a YMD (UTC noon).
 * @param {string} ymd
 */
function weekdayKey(ymd) {
	const [y, m, d] = ymd.split('-').map(Number);
	const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
	return ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'][wd];
}

/**
 * Expand moments that overlap [rangeStart, rangeEnd).
 * Recurring templates become virtual instances (`_virtual`, `_seriesId`).
 * @param {any[]} list
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @returns {any[]}
 */
export function expandMomentsInRange(list, rangeStart, rangeEnd) {
	/** @type {any[]} */
	const out = [];
	const exceptions = new Set(
		list
			.filter((m) => m.recurrence_exception_of && m.recurrence_instance)
			.map((m) => `${m.recurrence_exception_of}::${m.recurrence_instance}`)
	);

	for (const m of list) {
		if (m.status === 'canceled') continue;
		if (m.recurrence_exception_of) {
			const s = parseMs(m.start_at);
			const e = parseMs(m.end_at, s);
			if (e >= rangeStart && s < rangeEnd) out.push(m);
			continue;
		}
		if (!m.recurrence?.freq) {
			const s = parseMs(m.start_at);
			const e = parseMs(m.end_at, s + DAY_MS);
			if (Number.isFinite(s) && e >= rangeStart && s < rangeEnd) out.push(m);
			continue;
		}

		const rec = m.recurrence;
		const tz = rec.timezone || 'Europe/Brussels';
		const localStart = rec.local_start || '15:00';
		const localEnd = rec.local_end || '15:15';
		const interval = Math.max(1, Number(rec.interval) || 1);
		const until = parseMs(rec.until, rangeEnd);
		const seriesStart = parseMs(m.start_at, rangeStart);
		const cursor0 = Math.max(rangeStart, seriesStart);
		const cursorEnd = Math.min(rangeEnd, until + DAY_MS);

		let day = startOfUtcDay(cursor0);
		const endDay = startOfUtcDay(cursorEnd);
		let step = 0;
		while (day < endDay) {
			const ymd = ymdInTz(day, tz);
			const seriesYmd = ymdInTz(seriesStart, tz);
			if (ymd >= seriesYmd) {
				const okWeek =
					rec.freq !== 'weekly' ||
					!Array.isArray(rec.by_weekday) ||
					!rec.by_weekday.length ||
					rec.by_weekday.includes(weekdayKey(ymd));
				const okInterval =
					rec.freq === 'daily'
						? daysBetween(seriesYmd, ymd) % interval === 0
						: true;
				if (okWeek && okInterval) {
					const startIso = localToUtcIso(ymd, localStart, tz);
					const endIso = localToUtcIso(ymd, localEnd, tz);
					const key = `${m.id}::${startIso}`;
					if (!exceptions.has(`${m.id}::${startIso}`) && !exceptions.has(key)) {
						out.push({
							...m,
							id: `${m.id}::${ymd}`,
							start_at: startIso,
							end_at: endIso,
							recurrence: null,
							_virtual: true,
							_seriesId: m.id
						});
					}
				}
			}
			day += DAY_MS;
			step += 1;
			if (step > 800) break;
		}
	}
	return out;
}

/** @param {number} ms */
function startOfUtcDay(ms) {
	const d = new Date(ms);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** @param {string} a @param {string} b */
function daysBetween(a, b) {
	const [ay, am, ad] = a.split('-').map(Number);
	const [by, bm, bd] = b.split('-').map(Number);
	const A = Date.UTC(ay, am - 1, ad);
	const B = Date.UTC(by, bm - 1, bd);
	return Math.round((B - A) / DAY_MS);
}

/**
 * Count moments linked to a task (series count as until-span estimate in range, else 1).
 * @param {any[]} list
 * @param {string} taskId
 */
export function countTaskMoments(list, taskId) {
	const kids = list.filter((m) => m.task_id === taskId && m.status !== 'canceled');
	let n = 0;
	for (const m of kids) {
		if (!m.recurrence?.freq) {
			n += 1;
			continue;
		}
		const start = parseMs(m.start_at);
		const until = parseMs(m.recurrence.until, start);
		if (!Number.isFinite(start) || !Number.isFinite(until)) {
			n += 1;
			continue;
		}
		const days = Math.max(1, Math.round((until - start) / DAY_MS) + 1);
		const interval = Math.max(1, Number(m.recurrence.interval) || 1);
		n += m.recurrence.freq === 'daily' ? Math.ceil(days / interval) : Math.ceil(days / (7 * interval));
	}
	return n;
}
