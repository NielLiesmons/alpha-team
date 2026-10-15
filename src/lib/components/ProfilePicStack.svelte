<script>
	import ProfilePic from './ProfilePic.svelte';

	let { profiles = [], text = '', size = 'xs' } = $props();

	const sizeMap = {
		xs: { overlap: 7, height: 24, pic: 24 },
		sm: { overlap: 8, height: 28, pic: 28 }
	};

	const displayed = $derived(profiles.slice(0, 3));
	const metrics = $derived(sizeMap[size] ?? sizeMap.xs);
</script>

<div class="profile-pic-stack">
	{#if displayed.length > 0}
		<div class="pics">
			{#each displayed as profile, i (profile.email ?? profile.name ?? i)}
				<div class="pic" style:z-index={displayed.length - i} style:margin-left={i === 0 ? '0' : `-${metrics.overlap}px`}>
					<ProfilePic name={profile.name ?? ''} size={metrics.pic} />
				</div>
			{/each}
		</div>
	{/if}
	{#if text}
		<div class="pill" style:height="{metrics.height}px" style:margin-left={displayed.length ? `-${metrics.overlap}px` : '0'}>
			<span>{text}</span>
		</div>
	{/if}
</div>

<style>
	.profile-pic-stack {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		flex-shrink: 0;
		min-width: 0;
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
		display: flex;
		align-items: center;
		padding: 0 12px 0 16px;
		background: var(--white8);
		border-radius: 9999px;
		min-width: 0;
		overflow: hidden;
	}

	.pill span {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
