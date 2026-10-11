<script>
	/** Simple line icons — swap for custom drawings later. */
	let { name = 'dot', size = 18 } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 18 18"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'drive'}
		<path d="M3 5.5h12M3 9h12M3 12.5h8" />
		<path d="M14.5 11.5v3M13 13h3" />
	{:else if name === 'mail'}
		<rect x="2.5" y="4.5" width="13" height="9" rx="1.5" />
		<path d="M3.5 5.5 9 10l5.5-4.5" />
	{:else if name === 'chat'}
		<path d="M3.5 4.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5V12.5h-.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" />
	{:else if name === 'publications'}
		<path d="M4 3.5h7.5L14.5 6v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
		<path d="M11.5 3.5V6H14.5M6 9h6M6 11.5h4" />
	{:else if name === 'projects'}
		<rect x="3" y="3" width="5.5" height="5.5" rx="1" />
		<rect x="9.5" y="3" width="5.5" height="5.5" rx="1" />
		<rect x="3" y="9.5" width="5.5" height="5.5" rx="1" />
		<path d="M12.25 11v3M10.75 12.5h3" />
	{:else if name === 'tasks'}
		<path d="M3.5 5h3M3.5 9h3M3.5 13h3" />
		<path d="M8.5 5h6M8.5 9h6M8.5 13h4" />
		<path d="M4.5 4.2 5.5 5.2 7 3.7" />
	{:else if name === 'notes'}
		<path d="M5 3.5h6.5L14 6v8.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
		<path d="M11.5 3.5V6H14M6.5 9h5M6.5 11.5h3.5" />
	{:else if name === 'calendar'}
		<rect x="3" y="4.5" width="12" height="10.5" rx="1.5" />
		<path d="M3 8h12M6.5 3v3M11.5 3v3" />
	{:else if name === 'settings'}
		<circle cx="9" cy="9" r="2.2" />
		<path
			d="M9 2.8v1.6M9 13.6v1.6M2.8 9h1.6M13.6 9h1.6M4.2 4.2l1.1 1.1M12.7 12.7l1.1 1.1M13.8 4.2l-1.1 1.1M5.3 12.7l-1.1 1.1"
		/>
	{:else}
		<circle cx="9" cy="9" r="2" />
	{/if}
</svg>
