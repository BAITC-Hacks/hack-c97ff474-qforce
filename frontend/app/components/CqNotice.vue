<script setup>
defineProps({ color: String, icon: { type: String, default: "info" } });
</script>
<template>
  <div class="notice" :class="color">
    <CqIcon :name="icon" />
    <div><slot /></div>
  </div>
</template>
