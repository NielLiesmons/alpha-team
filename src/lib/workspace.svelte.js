/** Session-only workspace. Refreshing the page restores the samples. */

const niel = { pubkey: 'niel', name: 'Niel' };
const lea = { pubkey: 'lea', name: 'Léa' };
const marc = { pubkey: 'marc', name: 'Marc' };

export const tasks = $state([
	{
		id: 't4',
		title: 'Check the tunnel vents',
		status: 'inReview',
		priority: 'urgent',
		body: 'South door sticks when the wind picks up.',
		labels: ['Farm', 'Urgent'],
		targets: [{ id: 'p1', label: 'Spring CSA' }],
		author: niel,
		assignees: [lea],
		commenters: [marc],
		createdAt: 4
	},
	{
		id: 't2',
		title: 'Pack the first ice cream tubs',
		status: 'inProgress',
		priority: 'medium',
		body: 'Vanilla only. Strawberry waits on the fruit.',
		labels: ['Shop'],
		targets: [],
		author: lea,
		assignees: [marc],
		commenters: [],
		createdAt: 3
	},
	{
		id: 't1',
		title: 'Move the egg mobile',
		status: 'open',
		priority: 'high',
		body: 'New paddock behind the tunnels, before Friday drop-off.',
		labels: ['Farm', 'Drop-off'],
		targets: [{ id: 'p2', label: 'Egg mobile' }],
		author: niel,
		assignees: [marc],
		commenters: [],
		createdAt: 2
	},
	{
		id: 't5',
		title: 'Order boxes for the market',
		status: 'backlog',
		priority: 'low',
		body: '',
		labels: ['Shop'],
		targets: [],
		author: marc,
		assignees: [],
		commenters: [],
		createdAt: 1
	},
	{
		id: 't3',
		title: 'Send the March letter',
		status: 'closed',
		priority: 'none',
		body: 'Already on the site.',
		labels: ['News'],
		targets: [],
		author: niel,
		assignees: [],
		commenters: [lea],
		createdAt: 0
	}
]);

export const projects = $state([
	{
		id: 'p1',
		title: 'Spring CSA',
		status: 'planned',
		summary: 'Drop-offs in Guingamp and Saint-Brieuc.',
		body: 'Open the list when the tunnels are producing.'
	},
	{
		id: 'p2',
		title: 'Egg mobile',
		status: 'inProgress',
		summary: 'Move the hens, then update the map.',
		body: 'Private notes stay off the website.'
	}
]);

export const notes = $state([
	{
		id: 'n1',
		title: 'Drop-off planning',
		body: `## This week\n\n- Wednesday: Guingamp\n- Thursday: Saint-Brieuc\n- Saturday: at the farm, by appointment\n`
	},
	{
		id: 'n2',
		title: 'Pasture notes',
		body: `Hens follow the sheep.\n\nThe logs for mushrooms stay on the north edge.\n`
	}
]);

export const ui = $state({
	/** @type {string | null} */
	projectId: 'p1',
	/** @type {string | null} */
	noteId: 'n1',
	/** @type {null | { kind: 'task' | 'project' | 'note', id?: string }} */
	composer: null
});

/** @param {'task' | 'project' | 'note'} kind @param {string} [id] @param {string} [status] */
export function openComposer(kind, id, status) {
	ui.composer = {
		kind,
		...(id ? { id } : {}),
		...(status ? { status } : {})
	};
}

export function closeComposer() {
	ui.composer = null;
}
