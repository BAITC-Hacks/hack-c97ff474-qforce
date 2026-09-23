<script setup>
import { titles } from "./utils/pages.js";
const { store } = useCareer();
const route = useRoute();
useHead({
  title: () =>
    `${titles[route.path === "/" ? "dashboard" : route.path.slice(1)] || "QCareer"} · QCareer`,
});
</script>
<template>
  <NuxtRouteAnnouncer /><NuxtLayout><NuxtPage /></NuxtLayout>
  <Transition name="toast"
    ><div v-if="store.toast" class="app-toast" role="status" aria-live="polite">
      {{ store.toast }}
    </div></Transition
  >
</template>
