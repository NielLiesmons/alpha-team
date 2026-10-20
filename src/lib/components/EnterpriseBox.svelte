<script>
	/**
	 * Five-point rounded star for an Enterprise — shallow tips, soft corners
	 * (stamp-adjacent, not a spiky badge).
	 */
	import { isProjectImageIcon } from '$lib/project-status.js';

	/** @type {{ state?: string, icon?: string | null, size?: number, onclick?: ((e: MouseEvent) => void) | null }} */
	let { state = 'active', icon = null, size = 24, onclick = null } = $props();

	/**
	 * Soft 5-point star: outer/inner close enough that tips aren’t sharp;
	 * path uses short quadratic fillets at each vertex.
	 */
	const PATH = $derived.by(() => {
		const cx = 12;
		const cy = 12;
		const spikes = 5;
		const outer = 10.6;
		const inner = 5.85;
		const tipRound = 0.55;
		const dentRound = 0.4;
		/** @type {{ x: number, y: number, r: number }[]} */
		const verts = [];
		for (let i = 0; i < spikes * 2; i++) {
			const r = i % 2 === 0 ? outer : inner;
			const a = (Math.PI * i) / spikes - Math.PI / 2;
			verts.push({
				x: cx + r * Math.cos(a),
				y: cy + r * Math.sin(a),
				r: i % 2 === 0 ? tipRound : dentRound
			});
		}
		/** @type {string[]} */
		const parts = [];
		for (let i = 0; i < verts.length; i++) {
			const prev = verts[(i - 1 + verts.length) % verts.length];
			const cur = verts[i];
			const next = verts[(i + 1) % verts.length];
			const toPrev = Math.hypot(prev.x - cur.x, prev.y - cur.y) || 1;
			const toNext = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
			const rr = Math.min(cur.r, toPrev * 0.35, toNext * 0.35);
			const ax = cur.x + ((prev.x - cur.x) / toPrev) * rr;
			const ay = cur.y + ((prev.y - cur.y) / toPrev) * rr;
			const bx = cur.x + ((next.x - cur.x) / toNext) * rr;
			const by = cur.y + ((next.y - cur.y) / toNext) * rr;
			if (i === 0) parts.push(`M ${ax.toFixed(3)} ${ay.toFixed(3)}`);
			else parts.push(`L ${ax.toFixed(3)} ${ay.toFixed(3)}`);
			parts.push(`Q ${cur.x.toFixed(3)} ${cur.y.toFixed(3)} ${bx.toFixed(3)} ${by.toFixed(3)}`);
		}
		return `${parts.join(' ')} Z`;
	});

	const sw = 1.4;
	const hasIcon = $derived(Boolean(icon && String(icon).trim()));
	const isImage = $derived(hasIcon && isProjectImageIcon(icon));
	const glyphSize = $derived(Math.round(size * 0.46));
	const stroke = $derived.by(() => {
		if (state === 'draft' || state === 'paused') return 'var(--white33)';
		if (state === 'closed') return 'var(--accent-1-66)';
		if (state === 'active') return 'var(--accent-2-66)';
		return 'var(--white33)';
	});
	const dash = $derived(state === 'draft' ? '3.5 2.5' : undefined);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="enterprise-box"
	style="width:{size}px; height:{size}px;"
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	aria-label={onclick ? 'Enterprise icon' : undefined}
	{onclick}
	onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(/** @type {any} */ (e)) : undefined}
>
	<svg viewBox="0 0 24 24" width={size} height={size} class="star" aria-hidden="true">
		<path d={PATH} fill="var(--fg-8)" stroke="none" />
		<path
			d={PATH}
			fill="none"
			stroke={stroke}
			stroke-width={sw}
			stroke-dasharray={dash}
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>

	<div class="center" aria-hidden="true">
		{#if isImage}
			<img class="icon-img" src={icon} alt="" width={glyphSize} height={glyphSize} />
		{:else if hasIcon}
			<span class="icon-emoji" style:font-size="{Math.round(size * 0.4)}px">{icon}</span>
		{:else}
			<span
				class="placeholder"
				style:width="{Math.round(size * 0.18)}px"
				style:height="{Math.round(size * 0.18)}px"
			></span>
		{/if}
	</div>
</div>

<style>
	.enterprise-box {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
		cursor: default;
	}

	.enterprise-box[role='button'] {
		cursor: pointer;
	}

	.star {
		position: absolute;
		inset: 0;
		display: block;
	}

	.center {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 1;
	}

	.icon-img {
		object-fit: cover;
		border-radius: 4px;
		display: block;
	}

	.icon-emoji {
		line-height: 1;
		user-select: none;
	}

	.placeholder {
		border-radius: 999px;
		background: var(--white33);
		display: block;
	}
</style>
