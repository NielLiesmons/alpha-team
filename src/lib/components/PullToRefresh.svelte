<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import PullToRefresh from '@alpha/ui/PullToRefresh.svelte';

	/** @type {{ onRefresh: () => Promise<void> | void, disabled?: boolean, children: import('svelte').Snippet }} */
	let { onRefresh, disabled = false, children } = $props();
</script>

<PullToRefresh {onRefresh} {disabled}>{@render children?.()}</PullToRefresh>
