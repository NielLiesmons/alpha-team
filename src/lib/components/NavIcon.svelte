<script>
	/**
	 * Nav glyphs — alpha-ui/icons, unified stroke (1.5, round joins, no overlapping edges).
	 * Projects hex from Chateau ProjectBox (pointy top/bottom).
	 * @type {{ name?: string, size?: number }}
	 */
	let { name = 'dot', size = 20 } = $props();

	const sw = 1.5;
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={sw}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'dashboard'}
		<path d="M4 4h7v7H4V4Z" />
		<path d="M13 4h7v7h-7V4Z" />
		<path d="M4 13h7v7H4v-7Z" />
		<path d="M13 13h7v7h-7v-7Z" />
	{:else if name === 'drive'}
		<!-- Scaled from drive.svg; single stroke weight, round caps -->
		<g transform="translate(1.2 2.4) scale(0.52)">
			<path
				d="M0.5 24.5L6.21 4.75C6.97 2.23 9.3 0.5 11.95 0.5h17.1c2.64 0 4.97 1.73 5.74 4.25L40.5 24.5"
			/>
			<path d="M7.5 18.5h26c3.87 0 7 3.13 7 7s-3.13 7-7 7h-26c-3.87 0-7-3.13-7-7s3.13-7 7-7Z" />
			<path d="M6.5 25.5h4" />
		</g>
	{:else if name === 'mail'}
		<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
		<path d="M5.2 7.2 12 12.2l6.8-5" />
	{:else if name === 'chat'}
		<path
			d="M12 3.5c4.14 0 7.5 3.14 7.5 7 0 3.86-3.36 7-7.5 7-1.05 0-2.04-.2-2.94-.57-.2-.09-.43-.11-.64-.05l-2.7.72c-.68.18-1.28-.46-1.06-1.12l.77-2.3c.08-.24.05-.5-.06-.72A6.7 6.7 0 0 1 4.5 10.5c0-3.86 3.36-7 7.5-7Z"
		/>
	{:else if name === 'tasks'}
		<!-- Open TaskBox -->
		<rect x="4.5" y="4.5" width="15" height="15" rx="4.5" />
	{:else if name === 'projects'}
		<!-- Chateau pointy-top hex (viewBox 24² path) -->
		<path
			d="M13.3 1.75 20.23 5.75Q21.53 6.5 21.53 8v8q0 1.5-1.3 2.25L13.3 22.25Q12 23 10.7 22.25L3.77 18.25Q2.47 17.5 2.47 16V8q0-1.5 1.3-2.25L10.7 1.75Q12 1 13.3 1.75Z"
		/>
	{:else if name === 'notes'}
		<!-- Single outline: page + BR dog-ear (no shared double strokes) -->
		<path
			d="M6 3.5h8.5A2 2 0 0 1 16.5 5.5V14L13 20.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5Z"
		/>
		<path d="M16.5 14h-2.2A1.3 1.3 0 0 0 13 15.3V20.5" />
	{:else if name === 'calendar'}
		<!-- Outer + inset divider (stops short of sides — no bright joins) -->
		<rect x="4" y="4" width="16" height="16" rx="3.5" />
		<path d="M7 9.25h10" />
	{:else if name === 'publications'}
		<path d="M6 3.5h8L18.5 8v10.5a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
		<path d="M14 3.5V7.5h4" />
		<path d="M8 12h8M8 15h5" />
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="2.5" />
		<path
			d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"
		/>
	{:else}
		<circle cx="12" cy="12" r="2.5" />
	{/if}
</svg>
