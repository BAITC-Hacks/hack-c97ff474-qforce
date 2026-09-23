<script setup>
const { t } = useLocale();
defineProps({
  label: String,
  value: [String, Number],
  caption: String,
  icon: { type: String, default: "chart" },
});
</script>
<template>
  <div class="metric">
    <div class="metric-icon"><CqIcon :name="icon" /></div>
    <div class="label">{{ t(label) }}</div>
    <div class="value">{{ t(value) }}</div>
    <div class="caption">{{ t(caption) }}</div>
  </div>
</template>
