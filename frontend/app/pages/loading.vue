<template>
  <div>
    <CqHeading
      title="Подбираем следующий шаг"
      subtitle="Отдельный макет состояния загрузки. На этом экране запрос к LLM не отправляется."
    />
    <div class="test-state">
      UI-СОСТОЯНИЕ · ожидание AI-ответа · целевой предел по ТЗ: до 10 секунд
    </div>
    <div class="grid three" aria-label="Макет загрузки рекомендаций">
      <div v-for="i in 3" :key="i" class="panel" aria-hidden="true">
        <div class="skeleton big" />
        <div class="skeleton title" />
        <div class="skeleton" />
        <div class="skeleton w-[70%]" />
        <div class="skeleton mt-9" />
        <div class="skeleton" />
      </div>
    </div>
    <div class="section">
      <CqNotice
        >Профиль и навыки остаются доступными. Длительный запрос можно отменить,
        а при тайм-ауте показать честно помеченную рекомендацию по
        правилам.</CqNotice
      >
    </div>
    <div class="section">
      <NuxtLink to="/recommendations" class="btn secondary"
        >Вернуться к рекомендациям <CqIcon name="back"
      /></NuxtLink>
    </div>
  </div>
</template>
