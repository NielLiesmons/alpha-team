import { seedPosts, seedProducts } from './fixtures.js';

/** Session-only copies. Refreshing the page restores the samples. */
export const posts = $state(structuredClone(seedPosts));
export const products = $state(structuredClone(seedProducts));

export function addPost() {
	const id = crypto.randomUUID();
	const today = new Date();
	const iso = [
		today.getFullYear(),
		String(today.getMonth() + 1).padStart(2, '0'),
		String(today.getDate()).padStart(2, '0')
	].join('-');
	posts.unshift({
		id,
		title: 'Sans titre',
		slug: 'sans-titre',
		status: 'draft',
		date: iso,
		body: ''
	});
	return id;
}

/** @param {string} id */
export function publishPost(id) {
	const post = posts.find((item) => item.id === id);
	if (!post) return;
	post.status = post.status === 'draft' ? 'published' : 'draft';
}

/** @param {string} id */
export function markSent(id) {
	const post = posts.find((item) => item.id === id);
	if (!post || post.status === 'draft') return;
	post.status = 'sent';
	post.sentAt = new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} id
 * @param {'in' | 'low' | 'out'} stock
 */
export function setStock(id, stock) {
	const product = products.find((item) => item.id === id);
	if (product) product.stock = stock;
}
