<script setup>
import { titles } from "./utils/pages.js";
import { initializeLocale, t, localeState } from './utils/i18n.js';
initializeLocale();
const { store, loadEmployee, loadCatalogs } = useCareer();
const route = useRoute();
watch(() => localeState.locale, () => {
  if (!store.user) return;
  if (store.profile && ['/dashboard', '/', '/profile', '/path', '/recommendations', '/activities', '/catalog', '/completion', '/hr-employee'].includes(route.path)) {
    void loadEmployee(store.profile.id);
  } else if (route.path !== '/event') {
    void loadCatalogs().catch(() => {});
  }
});
useHead({
  title: () =>
    `${t(titles[route.path === "/" ? "dashboard" : route.path.slice(1)] || "QCareer")} · QCareer`,
  htmlAttrs: { lang: () => localeState.locale },
});
</script>
<template>
  <NuxtRouteAnnouncer /><NuxtLayout><NuxtPage /></NuxtLayout>
  <Transition name="toast"
    ><div v-if="store.toast" class="app-toast" role="status" aria-live="polite">
      {{ t(store.toast) }}
    </div></Transition
  >
</template>
