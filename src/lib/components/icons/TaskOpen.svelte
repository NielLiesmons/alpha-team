<script>
	import TaskBox from '../TaskBox.svelte';
	/** @type {{ size?: number }} */
	let { size = 16 } = $props();
</script>

<TaskBox state="open" {size} embedded />
