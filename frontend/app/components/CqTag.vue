<script setup>
defineProps({ color: { type: String, default: "" } });
</script>
<template>
  <span class="tag" :class="color"><slot /></span>
</template>
