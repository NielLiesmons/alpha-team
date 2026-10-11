/** UI-only sample for the Bley space. */

/** @typedef {'draft' | 'published' | 'sent'} PostStatus */

export const seedPosts = [
	{
		id: 'story',
		title: 'Notre histoire',
		slug: 'notre-histoire',
		status: /** @type {PostStatus} */ ('published'),
		date: '2026-01-01',
		body: `On est Sarah & Niel, à Saint-Nicodème.

On a choisi une ferme à taille humaine, mobile et régénérative: les animaux bougent, le sol se repose, et on produit ce qu'on aime manger.

Cette page raconte d'où l'on vient et où l'on va. Plus de détails suivront au fil des saisons.`
	},
	{
		id: 'b1',
		title: 'Lettre de mars',
		slug: 'lettre-de-mars',
		status: /** @type {PostStatus} */ ('sent'),
		date: '2026-03-18',
		sentAt: '2026-03-18',
		body: `Les serres s'ouvrent, l'egg mobile a bougé, et on prépare les premiers pots de glace.

Pour réserver œufs, saucisses ou champignons: inscrivez-vous à la newsletter. On envoie les créneaux de dépôt et le lien de commande quand c'est ouvert.

À bientôt à Saint-Nicodème.`
	},
	{
		id: 'b2',
		title: 'Pourquoi le pâturage',
		slug: 'pourquoi-le-paturage',
		status: /** @type {PostStatus} */ ('draft'),
		date: '2026-02-10',
		body: `Pâturage = sol vivant, animaux dehors, et des produits qui ont du sens.

Les poules suivent les moutons; les bûches portent les champignons. On raconte ça ici, sans jargon.`
	}
];

export const seedSubscribers = [
	{ email: 'camille@example.com', name: 'Camille', status: 'confirmed' },
	{ email: 'luc@example.com', name: 'Luc', status: 'confirmed' },
	{ email: 'ines@example.com', name: 'Inès', status: 'confirmed' },
	{ email: 'marc@example.com', name: 'Marc', status: 'pending' },
	{ email: 'lea@example.com', name: 'Léa', status: 'confirmed' }
];

/** @typedef {'in' | 'low' | 'out'} Stock */
/** @typedef {'cart' | 'reserve' | 'subscribe'} Cta */

export const seedProducts = [
	{ id: 'eggs-6', category: 'eggs', name: 'Boîte de 6 œufs', priceEur: 320, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('cart') },
	{ id: 'eggs-12', category: 'eggs', name: 'Boîte de 12 œufs', priceEur: 580, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('cart') },
	{ id: 'eggs-24', category: 'eggs', name: 'Plateau de 24 œufs', priceEur: 1050, stock: /** @type {Stock} */ ('low'), cta: /** @type {Cta} */ ('cart') },
	{ id: 'ice-vanilla', category: 'icecream', name: 'Glace vanille', priceEur: 650, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('cart') },
	{ id: 'ice-strawberry', category: 'icecream', name: 'Glace fraise', priceEur: 650, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('cart') },
	{ id: 'ice-chocolate', category: 'icecream', name: 'Glace chocolat', priceEur: 650, stock: /** @type {Stock} */ ('out'), cta: /** @type {Cta} */ ('cart') },
	{ id: 'sausage-4', category: 'sausages', name: "Saucisses d'agneau (4 pcs)", priceEur: 890, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('reserve') },
	{ id: 'sausage-8', category: 'sausages', name: "Saucisses d'agneau (8 pcs)", priceEur: 1650, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('reserve') },
	{ id: 'mush-oyster', category: 'mushrooms', name: 'Pleurotes', priceEur: 750, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('reserve') },
	{ id: 'mush-shiitake', category: 'mushrooms', name: 'Shiitakés', priceEur: 850, stock: /** @type {Stock} */ ('low'), cta: /** @type {Cta} */ ('reserve') },
	{ id: 'bouquet-small', category: 'bouquets', name: 'Petit bouquet coupé', priceEur: 1200, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('subscribe') },
	{ id: 'bouquet-large', category: 'bouquets', name: 'Grand bouquet coupé', priceEur: 2200, stock: /** @type {Stock} */ ('in'), cta: /** @type {Cta} */ ('subscribe') }
];

export const categories = [
	{ id: 'all', label: 'Tout' },
	{ id: 'eggs', label: 'Œufs' },
	{ id: 'icecream', label: 'Glaces' },
	{ id: 'sausages', label: 'Saucisses' },
	{ id: 'mushrooms', label: 'Champignons' },
	{ id: 'bouquets', label: 'Bouquets' }
];

const letterMars = seedPosts[1].body;
const pasture = seedPosts[2].body;

/** @type {DriveNode} */
export const driveRoot = {
	name: '',
	kind: 'dir',
	children: [
		{
			name: 'public',
			kind: 'dir',
			children: [
				{
					name: 'posts',
					kind: 'dir',
					children: [
						{
							name: 'lettre-de-mars',
							kind: 'dir',
							children: [
								{
									name: 'post.json',
									kind: 'file',
									size: '1 Ko',
									preview: '{\n  "schema": "alpha.post/1",\n  "slug": "lettre-de-mars",\n  "title": "Lettre de mars",\n  "visibility": "public"\n}'
								},
								{ name: 'body.md', kind: 'file', size: '1 Ko', preview: letterMars }
							]
						},
						{
							name: 'pourquoi-le-paturage',
							kind: 'dir',
							children: [
								{ name: 'body.md', kind: 'file', size: '1 Ko', preview: pasture }
							]
						}
					]
				},
				{
					name: 'media',
					kind: 'dir',
					children: [
						{
							name: 'glace-vanille.jpg',
							kind: 'file',
							size: '840 Ko',
							preview: 'Aperçu image. Le fichier reste chiffré dans le Drive. Ici, seul le nom est montré.'
						}
					]
				}
			]
		},
		{
			name: 'private',
			kind: 'dir',
			children: [
				{
					name: 'invoices',
					kind: 'dir',
					children: [
						{
							name: '2026-03-abattoir.pdf',
							kind: 'file',
							size: '220 Ko',
							preview: 'Facture (exemple). Ce dossier ne sort jamais sur le site public.'
						}
					]
				},
				{
					name: 'ops',
					kind: 'dir',
					children: [
						{
							name: 'planning-depots.txt',
							kind: 'file',
							size: '1 Ko',
							preview: 'Mercredi: Guingamp\nJeudi: Saint-Brieuc\nSamedi: à la ferme, sur rendez-vous'
						}
					]
				}
			]
		}
	]
};

/**
 * @typedef {object} DriveNode
 * @property {string} name
 * @property {'dir' | 'file'} kind
 * @property {string} [size]
 * @property {string} [preview]
 * @property {DriveNode[]} [children]
 */

/** @param {string[]} path */
export function nodeAt(path) {
	/** @type {DriveNode} */
	let node = driveRoot;
	for (const part of path) {
		const next = node.children?.find((child) => child.name === part);
		if (!next) return null;
		node = next;
	}
	return node;
}

export const statusLabel = {
	draft: 'Draft',
	published: 'Published',
	sent: 'Sent'
};

export const stockLabel = {
	in: 'En stock',
	low: 'Stock bas',
	out: 'Rupture'
};

export const ctaLabel = {
	cart: 'Panier',
	reserve: 'Réservation',
	subscribe: 'Abonnement'
};

/** @param {number} cents */
export function formatEur(cents) {
	return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** @param {string} iso */
export function formatDate(iso) {
	const [year, month, day] = iso.split('-').map(Number);
	return new Intl.DateTimeFormat('fr-FR', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(year, month - 1, day));
}
