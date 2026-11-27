#!/usr/bin/env node
/**
 * Quiet vs catch-up wave flag math for Chat title Metaball.
 * Run: node scripts/test-chat-catchup-flags.mjs
 */
import {
	CHAT_RESUME_AWAY_MS,
	mergeChatRefreshOpts,
	resumeNeedsCatchUpWave,
	shouldShowChatSyncWave
} from '../src/lib/chat-catchup.js';

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

check(
	'warm open catch-up waves',
	shouldShowChatSyncWave({ quiet: false, catchUp: true, settled: true }) === true
);
check(
	'quiet tip poll never waves',
	shouldShowChatSyncWave({ quiet: true, catchUp: false, settled: true }) === false
);
check(
	'quiet wins even if catchUp set',
	shouldShowChatSyncWave({ quiet: true, catchUp: true, settled: false }) === false
);
check(
	'cold unsettle waves without catchUp',
	shouldShowChatSyncWave({ quiet: false, catchUp: false, settled: false }) === true
);
check(
	'settled without catchUp stays quiet',
	shouldShowChatSyncWave({ quiet: false, catchUp: false, settled: true }) === false
);

const merged = mergeChatRefreshOpts({ quiet: true, catchUp: false }, { quiet: false, catchUp: true });
check('coalesce promotes catchUp', merged.catchUp === true);
check('coalesce drops quiet when either wants wave', merged.quiet === false);

const tipMerged = mergeChatRefreshOpts({ quiet: true, tip: 'aaa' }, { quiet: true, tip: 'bbb' });
check('coalesce keeps latest tip', tipMerged.tip === 'bbb' && tipMerged.quiet === true);

const now = 1_000_000;
check(
	'short blur does not resume-wave',
	resumeNeedsCatchUpWave(now - 500, now, CHAT_RESUME_AWAY_MS) === false
);
check(
	'meaningful away resume-waves',
	resumeNeedsCatchUpWave(now - CHAT_RESUME_AWAY_MS, now, CHAT_RESUME_AWAY_MS) === true
);
check(
	'never-hidden does not resume-wave',
	resumeNeedsCatchUpWave(0, now, CHAT_RESUME_AWAY_MS) === false
);

const failed = results.filter((r) => !r.ok);
if (failed.length) {
	console.error(`\n${failed.length}/${results.length} failed`);
	process.exit(1);
}
console.log(`\n${results.length} passed`);
