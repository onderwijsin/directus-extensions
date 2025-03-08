<template>
    <VList :mandatory="false">
		<VListGroup 
			v-for="index in 10" 
			:key="index"
            disabled
		>
            <template #activator>
				<VListItem dense style="display: flex; align-items: center; gap: 1rem;">
					<div class="skeleton" style="width: 100px; height: 18px; border-radius: 5px;"></div>
                    <div class="skeleton" style="flex-grow: 1; height: 18px; border-radius: 5px;"></div>
					<div class="skeleton" style="width: 25px; height: 25px; border-radius: 5px;"></div>
					
				</VListItem>
			</template>
        </VListGroup>
    </VList>
</template>

<style scoped>
.skeleton {
    background-color: #f0f0f0;
    background-image: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: skeleton-loading 4s infinite linear;
}

.dark .skeleton {
    background-color: #222;
    background-image: linear-gradient(90deg, #222 25%, #333 50%, #222 75%);
}

@keyframes skeleton-loading {
    0% {
        background-position: 200% 0;
    }
    100% {
        background-position: -200% 0;
    }
}
</style>