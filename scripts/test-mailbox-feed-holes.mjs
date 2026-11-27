#!/usr/bin/env node
/**
 * Mailbox feed hole detection + incremental catch-up gate.
 * Run: node scripts/test-mailbox-feed-holes.mjs
 */
import {
	canIncrementalMailboxCatchUp,
	mailboxFeedHasHoles
} from '../src/lib/mailbox-feed.js';

/** @type {{ name: string, ok: boolean, detail?: string }[]} */
const results = [];

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} [detail]
 */
function check(name, ok, detail = '') {
	results.push({ name, ok, detail });
	if (!ok) console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	else console.log(`ok    ${name}`);
}

check('empty feed has no holes', mailboxFeedHasHoles([]) === false);
check('nullish feed has no holes', mailboxFeedHasHoles(null) === false);

const contiguous = [
	{ id: 'c', reply_to: 'b' },
	{ id: 'b', reply_to: 'a' },
	{ id: 'a' }
];
check('contiguous reply chain', mailboxFeedHasHoles(contiguous) === false);

const holed = [
	{ id: 'c', reply_to: 'missing-parent' },
	{ id: 'b' },
	{ id: 'a' }
];
check('missing reply_to is a hole', mailboxFeedHasHoles(holed) === true);

const reactionHole = [{ id: 'r1', kind: 'reaction', reply_to: 'gone' }, { id: 'x' }];
check('missing reaction target is a hole', mailboxFeedHasHoles(reactionHole) === true);

check(
	'incremental when complete contiguous',
	canIncrementalMailboxCatchUp({
		cachedTip: 'tip',
		complete: true,
		hasHoles: false
	}) === true
);
check(
	'no incremental without tip',
	canIncrementalMailboxCatchUp({ complete: true, hasHoles: false }) === false
);
check(
	'no incremental when incomplete',
	canIncrementalMailboxCatchUp({
		cachedTip: 'tip',
		complete: false,
		hasHoles: false
	}) === false
);
check(
	'no incremental when holes unaccepted',
	canIncrementalMailboxCatchUp({
		cachedTip: 'tip',
		complete: true,
		hasHoles: true,
		holesAccepted: false
	}) === false
);
check(
	'incremental when holes accepted after genesis',
	canIncrementalMailboxCatchUp({
		cachedTip: 'tip',
		complete: true,
		hasHoles: true,
		holesAccepted: true
	}) === true
);
check(
	'forceFull always deep walk',
	canIncrementalMailboxCatchUp({
		cachedTip: 'tip',
		complete: true,
		hasHoles: false,
		forceFull: true
	}) === false
);

const failed = results.filter((r) => !r.ok);
if (failed.length) {
	console.error(`\n${failed.length}/${results.length} failed`);
	process.exit(1);
}
console.log(`\n${results.length} passed`);
