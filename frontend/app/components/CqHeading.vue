<script setup>
const { t } = useLocale();
defineProps({ title: String, subtitle: String, rawTitle: Boolean });
</script>
<template>
  <div class="page-heading">
    <div>
      <h1>{{ rawTitle ? title : t(title) }}</h1>
      <p v-if="subtitle">{{ t(subtitle) }}</p>
    </div>
    <div v-if="$slots.default" class="actions"><slot /></div>
  </div>
</template>
