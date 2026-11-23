<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import CreateSheet from '@alpha/ui/CreateSheet.svelte';
	import { t } from '$lib/i18n.svelte.js';

	let {
		open = false,
		label = 'Create',
		fullscreen = false,
		dragDismiss = true,
		showTopbar = true,
		onclose = () => {},
		onmore = undefined,
		children
	} = $props();
</script>

<CreateSheet
	{open}
	{label}
	{fullscreen}
	{dragDismiss}
	{showTopbar}
	closeLabel={t('common.close')}
	moreLabel={t('common.more')}
	{onclose}
	{onmore}
	>{@render children?.()}</CreateSheet
>
