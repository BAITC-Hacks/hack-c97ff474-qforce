<script setup>
const props = defineProps({ kind: String });
const options = {
  error: {
    icon: "refresh",
    title: "Рекомендация временно недоступна",
    description:
      "Не удалось получить ответ AI-сервиса. Ваш прогресс сохранён; можно повторить запрос или перейти к правилам подбора.",
    button: "К подбору по правилам",
    to: "/recommendations",
    note: "Тайм-аут / недоступность LLM",
  },
  forbidden: {
    icon: "lock",
    title: "Доступ ограничен",
    description:
      "Этот раздел предназначен для HR. В рабочей системе доступ проверяет сервер. Здесь показан только дизайн состояния 403.",
    button: "В моё пространство",
    to: "/dashboard",
    note: "403 — серверная реализация требуется",
  },
  "no-recommendations": {
    icon: "path",
    title: "Подходящего шага пока нет",
    description:
      "Это не означает, что вы не развиваетесь. Доступные активности могут быть уже завершены, не подходить по аудитории или не закрывать текущую цель.",
    button: "Пересмотреть цель",
    to: "/path",
    note: "Пустой допустимый набор",
  },
  "not-found": {
    icon: "search",
    title: "Страница не найдена",
    description:
      "Такой страницы или записи нет. Вернитесь к своему развитию или откройте каталог.",
    button: "На главную",
    to: "/dashboard",
  },
};
const config = computed(() => options[props.kind] || options["not-found"]);
</script>
<template>
  <div>
    <CqHeading
      :title="config.title"
      :subtitle="
        kind === 'not-found'
          ? 'Проверьте адрес страницы.'
          : 'Макет отдельного состояния продукта.'
      "
    />
    <div v-if="config.note" class="test-state">
      UI-СОСТОЯНИЕ · {{ config.note }}
    </div>
    <section class="panel state-panel">
      <div class="state-icon"><CqIcon :name="config.icon" /></div>
      <h2>{{ config.title }}</h2>
      <p>{{ config.description }}</p>
      <div class="actions">
        <NuxtLink :to="config.to" class="btn"
          >{{ config.button }} <CqIcon name="arrow" /></NuxtLink
        ><NuxtLink
          :to="kind === 'no-recommendations' ? '/catalog' : '/profile'"
          class="btn secondary"
          >{{
            kind === "no-recommendations" ? "Открыть каталог" : "К профилю"
          }}
          <CqIcon name="arrow"
        /></NuxtLink>
      </div>
    </section>
    <div v-if="kind === 'no-recommendations'" class="grid three">
      <section
        v-for="[title, desc] in [
          [
            '1. Проверить цель',
            'Она могла измениться или быть предложена системой.',
          ],
          [
            '2. Посмотреть ограничения',
            'Роль, грейд, входные навыки, сессии и повторное участие.',
          ],
          [
            '3. Обсудить с HR',
            'Каталог может не покрывать нужный навык. Не нужно выдумывать курс.',
          ],
        ]"
        :key="title"
        class="panel"
      >
        <h3>{{ title }}</h3>
        <p class="small muted section">{{ desc }}</p>
      </section>
    </div>
  </div>
</template>
