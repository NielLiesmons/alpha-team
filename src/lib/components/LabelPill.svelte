<script>
	import { stringToColor } from '$lib/color.js';

	/** @type {{ text?: string, size?: 'small' | 'meta' | 'default' }} */
	let { text = '', size = 'small' } = $props();

	const base = $derived(stringToColor(text || ' '));
	const bg = $derived(`rgba(${base.r}, ${base.g}, ${base.b}, 0.16)`);
</script>

<span
	class="label"
	class:small={size === 'small'}
	class:meta={size === 'meta'}
	style:--bg-color={bg}
>
	<span class="content">{text}</span>
	<svg class="triangle" viewBox="0 0 24 32" fill="none" aria-hidden="true">
		<path
			d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z"
			fill="var(--bg-color)"
		/>
	</svg>
</span>

<style>
	.label {
		display: inline-flex;
		align-items: center;
		height: 32px;
		pointer-events: none;
	}

	.label.small {
		height: 24px;
	}

	.label.meta {
		height: 32px;
	}

	.content {
		display: flex;
		align-items: center;
		height: 32px;
		padding-left: 12px;
		padding-right: 4px;
		background: var(--bg-color);
		border-radius: 12px 0 0 12px;
		max-width: 200px;
		overflow: hidden;
		font-size: 14px;
		font-weight: 400;
		color: var(--white66);
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.label.small .content {
		height: 24px;
		padding-left: 8px;
		padding-right: 2px;
		border-radius: 8px 0 0 8px;
		max-width: 160px;
		font-size: 12px;
	}

	.label.meta .content {
		height: 32px;
		padding-left: 12px;
		padding-right: 4px;
		border-radius: 12px 0 0 12px;
		max-width: 160px;
		font-size: 13px;
		font-weight: 500;
	}

	.triangle {
		flex-shrink: 0;
		width: 24px;
		height: 32px;
	}

	.label.small .triangle {
		width: 18px;
		height: 24px;
	}

	.label.meta .triangle {
		width: 24px;
		height: 32px;
	}
</style>
