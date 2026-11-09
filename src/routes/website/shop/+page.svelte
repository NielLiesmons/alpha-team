<script>
	import SectionPlaceholder from '$lib/components/SectionPlaceholder.svelte';
	import { t } from '$lib/i18n.svelte.js';
</script>

<svelte:head><title>{t('nav.shop')}</title></svelte:head>

<SectionPlaceholder
	title={t('nav.shop')}
	body="Manage public products (alpha.product/1 via alpha-api). Checkout stays outside the private Drive."
/>
