<script setup>
const { t, locale, initLocale } = useLocale();
initLocale();
import { titles } from "./utils/pages.js";
import { localeState } from './utils/i18n.js';
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
  htmlAttrs: { lang: () => locale.value },
  meta: [
    {
      name: "description",
      content: () => t("Ваше личное пространство развития."),
    },
  ],
  title: () =>
    `${t(titles[route.path === "/" ? "dashboard" : route.path.slice(1)] || "QCareer")} · QCareer`,
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
