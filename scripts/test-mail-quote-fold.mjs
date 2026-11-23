#!/usr/bin/env node
/**
 * Focused assertions for mail quote folding + trailing trim.
 * Run: node scripts/test-mail-quote-fold.mjs
 */
import {
	splitMailQuote,
	isHtmlMailBody,
	trimTrailingEmptyPlain,
	trimTrailingEmptyHtml
} from '../src/lib/mail-body.js';

/** @type {{ name: string, body: string, expectMain?: RegExp, forbidMain?: RegExp, collapsible?: boolean, expectQuoted?: RegExp }[]} */
const cases = [
	{
		name: 'Philadelphe plain EN',
		body: `Thanks for the update.\n\nOn 21/11/2026 21:27, Philadelphe Divry Lucie wrote:\n> Hi there\n> How are you?`,
		expectMain: /^Thanks for the update\.?$/,
		forbidMain: /Philadelphe|wrote:/i,
		collapsible: true,
		expectQuoted: /On 21\/11\/2026 21:27, Philadelphe Divry Lucie wrote:/
	},
	{
		name: 'Philadelphe HTML div + blockquote',
		body: `<div>Thanks for the update.</div><div><br></div><div>On 21/11/2026 21:27, Philadelphe Divry Lucie wrote:</div><blockquote type="cite"><div>Hi there</div></blockquote>`,
		expectMain: /^Thanks for the update\.?$/,
		forbidMain: /Philadelphe|wrote:/i,
		collapsible: true,
		expectQuoted: /Philadelphe/
	},
	{
		name: 'FR Le a écrit HTML',
		body: `<div>Merci</div><div>Le 21/11/2026 à 21:27, Philadelphe Divry Lucie a écrit :</div><blockquote>Prev</blockquote>`,
		expectMain: /^Merci$/,
		forbidMain: /a écrit|Philadelphe/i,
		collapsible: true,
		expectQuoted: /a écrit/
	},
	{
		name: 'FR entity HTML',
		body: `<div>Merci</div><div>Le 21 novembre 2026 à 21:27, Philadelphe Divry Lucie a &eacute;crit :</div><blockquote>Hi</blockquote>`,
		expectMain: /^Merci$/,
		forbidMain: /écrit|ecrit|Philadelphe/i,
		collapsible: true
	},
	{
		name: 'moz-cite-prefix',
		body: `<div>Ok</div><div class="moz-cite-prefix">On 21/11/2026 21:27, Philadelphe Divry Lucie wrote:<br></div><blockquote type="cite">Old</blockquote>`,
		expectMain: /^Ok$/,
		forbidMain: /Philadelphe|wrote:/i,
		collapsible: true
	},
	{
		name: 'attr inside same div with brs',
		body: `<div dir="auto">Thanks for the update.<br><br>On 21/11/2026 21:27, Philadelphe Divry Lucie wrote:<br></div><blockquote type="cite">Previous message</blockquote>`,
		expectMain: /^Thanks for the update\.?$/,
		forbidMain: /Philadelphe|wrote:/i,
		collapsible: true
	},
	{
		name: 'ZWSP / NBSP in attribution',
		body: `<div>Thanks</div><p>On 21/11/2026 21:27,&nbsp;Philadelphe Divry Lucie wrote:\u200b</p><blockquote>Prev</blockquote>`,
		expectMain: /^Thanks$/,
		forbidMain: /Philadelphe|wrote:/i,
		collapsible: true
	},
	{
		name: 'inline blockquote before real attribution',
		body: `<div>See below <blockquote>snippet</blockquote> more reply text</div><div>On 21/11/2026 21:27, Philadelphe Divry Lucie wrote:</div><blockquote>Full prior</blockquote>`,
		forbidMain: /On 21\/11\/2026|Philadelphe Divry Lucie wrote:/i,
		collapsible: true,
		expectQuoted: /Philadelphe/
	},
	{
		name: 'trailing blank lines trimmed from main',
		body: `Hello there\n\n\n\nOn 21/11/2026 21:27, Philadelphe Divry Lucie wrote:\n> x`,
		expectMain: /^Hello there$/,
		collapsible: true
	},
	{
		name: 'trailing empty HTML trimmed',
		body: `<div>Hello</div><div><br></div><div><br></div><div>On 21/11/2026 21:27, Philadelphe Divry Lucie wrote:</div><blockquote>x</blockquote>`,
		expectMain: /^Hello$/,
		collapsible: true
	}
];

let failed = 0;

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} [detail]
 */
function assert(name, ok, detail = '') {
	if (ok) {
		console.log(`  ok  ${name}`);
		return;
	}
	failed += 1;
	console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('mail quote fold tests\n');

for (const c of cases) {
	console.log(`• ${c.name}`);
	const r = splitMailQuote(c.body);
	const rich = isHtmlMailBody(c.body) && !r.collapsible;
	const visible = rich ? c.body : r.htmlMain || r.main;
	const visiblePlain = String(visible)
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	if (c.collapsible != null) {
		assert('collapsible', r.collapsible === c.collapsible, `got ${r.collapsible}`);
	}
	if (c.expectMain) {
		assert('main', c.expectMain.test(String(r.main).trim()), JSON.stringify(r.main));
	}
	if (c.forbidMain) {
		assert(
			'no attr in main/htmlMain',
			!c.forbidMain.test(String(r.main)) && !c.forbidMain.test(String(r.htmlMain || '')),
			`main=${JSON.stringify(r.main)} htmlMain=${JSON.stringify(r.htmlMain || '').slice(0, 120)}`
		);
		assert('no attr in visible', !c.forbidMain.test(visiblePlain), visiblePlain.slice(0, 120));
	}
	if (c.expectQuoted) {
		assert('quoted', c.expectQuoted.test(r.quoted), JSON.stringify(r.quoted).slice(0, 120));
	}
	assert('not rich-full leak', !(rich && /Philadelphe|wrote:/i.test(c.body) && c.collapsible));
}

console.log('\n• trim helpers');
assert(
	'trimTrailingEmptyPlain',
	trimTrailingEmptyPlain('Hi\n\n\n') === 'Hi',
	JSON.stringify(trimTrailingEmptyPlain('Hi\n\n\n'))
);
assert(
	'trimTrailingEmptyHtml',
	!/<br/i.test(trimTrailingEmptyHtml('<div>Hi</div><br><br><div><br></div>')),
	trimTrailingEmptyHtml('<div>Hi</div><br><br><div><br></div>')
);

if (failed) {
	console.error(`\n${failed} assertion(s) failed`);
	process.exit(1);
}
console.log('\nAll passed.');
