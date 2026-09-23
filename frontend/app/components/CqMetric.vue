<script setup>
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
    <div class="label">{{ label }}</div>
    <div class="value">{{ value }}</div>
    <div class="caption">{{ caption }}</div>
  </div>
</template>
