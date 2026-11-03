<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import BaseIcon from '@alpha/ui/icons/BaseIcon.svelte';

	/** @type {{ size?: number, className?: string, children?: import('svelte').Snippet }} */
	let { size = 22, className = '', children } = $props();
</script>

<BaseIcon {size} {className}>{@render children?.()}</BaseIcon>
