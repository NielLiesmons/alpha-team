<script>
	import SectionPlaceholder from '$lib/components/SectionPlaceholder.svelte';
	import { t } from '$lib/i18n.svelte.js';
</script>

<svelte:head><title>{t('nav.content')}</title></svelte:head>

<SectionPlaceholder
	title={t('nav.content')}
	body="Edit public site pages and copy for this Space. Drive stays the source of truth — wiring continues."
/>
