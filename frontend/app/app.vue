<script setup>
const { t, locale, initLocale } = useLocale();
initLocale();
import { titles } from "./utils/pages.js";
const { store } = useCareer();
const route = useRoute();
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
