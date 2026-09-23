// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: false },
  modules: ["@nuxtjs/tailwindcss"],
  css: ["~/assets/css/design.css", "~/assets/css/app.css"],
  app: {
    head: {
      htmlAttrs: { lang: "ru" },
      title: "QCareer — ваш следующий шаг",
      meta: [
        {
          name: "description",
          content:
            "Карьерная траектория, навыки и понятные шаги развития. Локальное демо QCareer.",
        },
        { name: "theme-color", content: "#087F6B" },
      ],
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    },
  },
});
