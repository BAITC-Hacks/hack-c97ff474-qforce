<script setup>
import { titles } from "./utils/pages.js";
const { store, hydrate } = useCareer(),
  route = useRoute();
hydrate();
useHead({
  title: () =>
    `${titles[route.path === "/" ? "dashboard" : route.path.slice(1)] || "QCareer"} · QCareer`,
});
onMounted(() => {
  const hash = window.location.hash.slice(1);
  if (titles[hash]) navigateTo("/" + hash, { replace: true });
});
</script>
<template>
  <NuxtRouteAnnouncer /><NuxtLayout><NuxtPage /></NuxtLayout
  ><Transition name="toast"
    ><div v-if="store.toast" class="app-toast" role="status" aria-live="polite">
      {{ store.toast }}
    </div></Transition
  >
</template>
