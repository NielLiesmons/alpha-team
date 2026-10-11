<script>
	/** Empty shell until this section has a real Drive/API surface. */
	let { title, body } = $props();
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<header class="page-head">
	<div>
		<h1>{title}</h1>
		<p>{body}</p>
	</div>
</header>
