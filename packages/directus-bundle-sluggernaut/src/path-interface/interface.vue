<script lang="ts" setup>
import InputWithCopy from '../shared/InputWithCopy.vue';

const props = withDefaults(defineProps<{
    value: string | null;
    disabled?: boolean;
    locale?: string;
}>(), {
    disabled: false,
    locale: 'en'
});

</script>
<template>
	<InputWithCopy 
		v-bind="props"
		field-type="path"
	/>
</template>