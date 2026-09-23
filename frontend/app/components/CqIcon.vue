<script setup>
import { icons } from "../utils/icons.js";
defineProps({ name: { type: String, default: "layers" } });
</script>
<template>
  <svg
    class="svg-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="icons[name] || icons.layers" />
  </svg>
</template>
