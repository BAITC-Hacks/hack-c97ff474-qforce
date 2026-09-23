<script setup>
defineProps({ blocks: { type: Array, default: () => ['catalogs', 'grades', 'history', 'eligible', 'recommendations'] } });
const { store, loadBlock } = useCareer();
const { t } = useLocale();
const names = { catalogs: 'Каталог', grades: 'Грейды', history: 'История участия', eligible: 'Доступность активностей', recommendations: 'Рекомендации' };
</script>
<template>
  <div v-for="block in blocks.filter(key => store.blockErrors[key])" :key="block" class="section" :data-error-block="block" role="alert">
    <CqNotice color="gold">{{ t(names[block]) }}: {{ t(store.blockErrors[block]) }}</CqNotice>
    <button class="btn secondary section" :disabled="store.blockLoading[block]" @click="loadBlock(block)">{{ t('Повторить загрузку блока') }}</button>
  </div>
</template>
