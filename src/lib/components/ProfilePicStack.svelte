<script>
	import ProfilePic from './ProfilePic.svelte';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';

	/**
	 * @type {{
	 *   profiles?: Array<{ name?: string, email?: string, pictureUrl?: string | null }>,
	 *   text?: string,
	 *   size?: 'xxs' | 'xs' | 'sm' | 'md',
	 *   onclick?: ((e: MouseEvent) => void) | null
	 * }}
	 */
	let { profiles = [], text = '', size = 'xs', onclick = null } = $props();

	const sizeMap = {
		xxs: { overlap: 6, height: 20, pic: 20 },
		xs: { overlap: 7, height: 24, pic: 24 },
		sm: { overlap: 8, height: 28, pic: 28 },
		md: { overlap: 12, height: 36, pic: 36 }
	};

	const displayed = $derived(profiles.slice(0, 3));
	const metrics = $derived(sizeMap[size] ?? sizeMap.xs);
</script>

{#if onclick}
	<button type="button" class="profile-pic-stack hit" {onclick}>
		{#if displayed.length > 0}
			<div class="pics">
				{#each displayed as profile, i (profile.email ?? profile.name ?? i)}
					<div
						class="pic"
						style:z-index={displayed.length - i}
						style:margin-left={i === 0 ? '0' : `-${metrics.overlap}px`}
					>
						<ProfilePic
							name={profile.name ?? ''}
							email={profile.email ?? ''}
							pictureUrl={profile.pictureUrl ?? pictureUrlFor(profile.email)}
							size={metrics.pic}
						/>
					</div>
				{/each}
			</div>
		{/if}
		{#if text}
			<div
				class="pill"
				style:height="{metrics.height}px"
				style:margin-left={displayed.length ? `-${metrics.overlap}px` : '0'}
			>
				<span>{text}</span>
			</div>
		{/if}
	</button>
{:else}
	<div class="profile-pic-stack">
		{#if displayed.length > 0}
			<div class="pics">
				{#each displayed as profile, i (profile.email ?? profile.name ?? i)}
					<div
						class="pic"
						style:z-index={displayed.length - i}
						style:margin-left={i === 0 ? '0' : `-${metrics.overlap}px`}
					>
						<ProfilePic
							name={profile.name ?? ''}
							email={profile.email ?? ''}
							pictureUrl={profile.pictureUrl ?? pictureUrlFor(profile.email)}
							size={metrics.pic}
						/>
					</div>
				{/each}
			</div>
		{/if}
		{#if text}
			<div
				class="pill"
				style:height="{metrics.height}px"
				style:margin-left={displayed.length ? `-${metrics.overlap}px` : '0'}
			>
				<span>{text}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.profile-pic-stack {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		flex-shrink: 0;
		min-width: 0;
	}

	.profile-pic-stack.hit {
		padding: 0;
		border: 0;
		margin: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
		text-align: left;
	}

	.pics {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		flex-shrink: 0;
	}

	.pic {
		position: relative;
	}

	.pic:not(:last-child) :global(.profile-pic) {
		box-shadow: 4px 0 8px -2px var(--black66);
	}

	.pill {
		position: relative;
		/* Above the last avatar overlap so the count stays readable. */
		z-index: 4;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 8px;
		background: var(--white8, var(--fg-8, color-mix(in srgb, var(--fg, var(--ink)) 8%, transparent)));
		border-radius: 9999px;
		min-width: 0;
		overflow: hidden;
		box-sizing: border-box;
	}

	/* Overlap into the last avatar when stack is present. */
	.pics + .pill {
		padding: 0 10px 0 14px;
	}

	.pill span {
		position: relative;
		z-index: 1;
		font-size: 0.8125rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--white66, var(--fg-66, color-mix(in srgb, var(--fg, var(--ink)) 66%, transparent)));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
