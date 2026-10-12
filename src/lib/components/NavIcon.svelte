<script>
	/**
	 * Nav glyphs — paths match alpha-ui/icons/*.svg (shared design system).
	 * @type {{ name?: string, size?: number }}
	 */
	let { name = 'dot', size = 20 } = $props();
</script>

{#if name === 'drive'}
	<svg width={size} height={size} viewBox="0 0 41 33" fill="none" aria-hidden="true">
		<path
			d="M0.5 24.5L6.2056 4.75303C6.9745 2.22664 9.30483 0.5 11.9456 0.5H29.0544C31.6952 0.5 34.0255 2.22664 34.7944 4.75303L40.5 24.5M6.5 25.5H10.5M7.5 32.5H33.5C37.366 32.5 40.5 29.366 40.5 25.5C40.5 21.634 37.366 18.5 33.5 18.5H7.5C3.63401 18.5 0.5 21.634 0.5 25.5C0.5 29.366 3.63401 32.5 7.5 32.5Z"
			stroke="currentColor"
			stroke-linecap="round"
		/>
	</svg>
{:else if name === 'chat'}
	<svg width={size} height={size} viewBox="0 0 18 19" fill="none" aria-hidden="true">
		<path
			d="M9 0.5C13.6944 0.5 17.5 4.30558 17.5 9C17.5 13.6944 13.6944 17.5 9 17.5C7.77335 17.5 6.60815 17.2386 5.55507 16.7706C5.3323 16.6716 5.08291 16.6441 4.84737 16.7069L1.79379 17.5216C1.02463 17.7269 0.335703 16.9948 0.587211 16.2395L1.4629 13.6098C1.55241 13.341 1.52084 13.0482 1.39409 12.7948C0.822691 11.6525 0.5 10.3641 0.5 9C0.5 4.30563 4.30565 0.500084 9 0.5Z"
			stroke="currentColor"
		/>
	</svg>
{:else if name === 'mail'}
	<svg width={size} height={size} viewBox="0 0 26 22" fill="none" aria-hidden="true">
		<path
			d="M24.7 5.75371L14.7449 11.5613C13.5716 12.2457 12.1383 12.288 10.9324 11.6893L10.6941 11.5613L0.739062 5.75371V16.7195C0.739062 18.9176 2.52144 20.7 4.71953 20.7H20.7195C22.9176 20.7 24.7 18.9176 24.7 16.7195V5.75371ZM24.7 4.71953C24.7 2.52144 22.9176 0.739062 20.7195 0.739062H4.71953C2.52144 0.739062 0.739062 2.52144 0.739062 4.71953V5.70684L10.7137 11.5262L10.95 11.6541C12.1439 12.2469 13.5637 12.2038 14.7254 11.5262L24.7 5.70684V4.71953ZM24.7391 16.7195C24.7391 18.9397 22.9397 20.7391 20.7195 20.7391H4.71953C2.49935 20.7391 0.7 18.9397 0.7 16.7195V4.71953C0.7 2.49935 2.49935 0.7 4.71953 0.7H20.7195C22.9397 0.7 24.7391 2.49935 24.7391 4.71953V16.7195Z"
			stroke="currentColor"
			stroke-width="1.6"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{:else if name === 'tasks'}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<rect x="1.5" y="1.5" width="15" height="15" rx="4.5" stroke="currentColor" stroke-width="1.4" />
	</svg>
{:else if name === 'projects'}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<path
			d="M5.2 2.8h7.6c.45 0 .87.24 1.1.63l3.05 5.07c.23.39.23.87 0 1.26l-3.05 5.07c-.23.39-.65.63-1.1.63H5.2c-.45 0-.87-.24-1.1-.63L1.05 9.76c-.23-.39-.23-.87 0-1.26L4.1 3.43c.23-.39.65-.63 1.1-.63Z"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linejoin="round"
		/>
	</svg>
{:else if name === 'notes'}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<path
			d="M4 1.5h10A2.5 2.5 0 0 1 16.5 4v8L12 16.5H4A2.5 2.5 0 0 1 1.5 14V4A2.5 2.5 0 0 1 4 1.5Z"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linejoin="round"
		/>
		<path
			d="M16.5 12H13.5A1.5 1.5 0 0 0 12 13.5V16.5"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linejoin="round"
		/>
	</svg>
{:else if name === 'calendar'}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<rect x="1.5" y="1.5" width="15" height="15" rx="4" stroke="currentColor" stroke-width="1.4" />
		<path d="M1.5 6.5h15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
	</svg>
{:else if name === 'dashboard'}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<rect x="1.5" y="1.5" width="15" height="15" rx="1" stroke="currentColor" stroke-width="1.4" />
		<path d="M9 1.5v15M1.5 9h15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
	</svg>
{:else if name === 'publications'}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<path
			d="M3.5 2.5h8L15.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 2.5 15V4A1.5 1.5 0 0 1 4 2.5h-.5Z"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linejoin="round"
		/>
		<path
			d="M11.5 2.5V5.5H14.5M5.5 9h7M5.5 11.5h5"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{:else if name === 'settings'}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<circle cx="9" cy="9" r="2.25" stroke="currentColor" stroke-width="1.4" />
		<path
			d="M9 1.75v1.5M9 14.75v1.5M1.75 9h1.5M14.75 9h1.5M3.4 3.4l1.06 1.06M13.54 13.54l1.06 1.06M14.6 3.4l-1.06 1.06M4.46 13.54l-1.06 1.06"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linecap="round"
		/>
	</svg>
{:else}
	<svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<circle cx="9" cy="9" r="2" stroke="currentColor" stroke-width="1.4" />
	</svg>
{/if}
