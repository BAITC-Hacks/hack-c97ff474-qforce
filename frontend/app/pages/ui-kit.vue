<script setup>
const { notify } = useCareer();
const colors = [
  ["#087F6B", "Основной зелёный", true],
  ["#074E43", "Глубокий зелёный", true],
  ["#EDBD57", "Тёплый акцент", false],
  ["#EAF6F0", "Мягкий фон", false],
  ["#19372F", "Основной текст", true],
  ["#697A74", "Вторичный текст", true],
  ["#F5F7F4", "Фон приложения", false],
  ["#E0E8E1", "Разделители", false],
];
</script>
<template>
  <div>
    <CqHeading
      title="Дизайн-система QCareer"
      subtitle="Палитра и компоненты из Career Quest Halyk Pack. Самостоятельный концепт, не официальный брендбук."
      ><NuxtLink to="/screens" class="btn secondary"
        >Все экраны <CqIcon name="layers" /></NuxtLink
    ></CqHeading>
    <div class="grid main-aside">
      <section class="panel">
        <h2>Цветовая система</h2>
        <div class="swatches section">
          <div
            v-for="[color, title, light] in colors"
            :key="color"
            class="swatch"
            :style="{ background: color, color: light ? 'white' : '#19372F' }"
          >
            <div>{{ color }}<br />{{ title }}</div>
          </div>
        </div>
      </section>
      <section class="panel">
        <h2>Типографика</h2>
        <div class="section">
          <h1>Понятный рост</h1>
          <div class="small muted">H1 · 32 px / 1.22</div>
        </div>
        <div class="section">
          <h2>Следующий шаг</h2>
          <div class="small muted">H2 · 21 px / 1.35</div>
        </div>
        <div class="section">
          <h3>Активность развития</h3>
          <div class="small muted">H3 · 17 px / 1.4</div>
        </div>
        <p class="section small muted">
          Системные шрифты: Segoe UI / Arial. Внешние шрифты не загружаются.
        </p>
      </section>
    </div>
    <div class="grid two section">
      <section class="panel">
        <h2>Действия и статусы</h2>
        <div class="actions section">
          <button
            class="btn"
            @click="notify('Основное действие — компонент дизайн-системы')"
          >
            Основное действие <CqIcon name="arrow" /></button
          ><button
            class="btn secondary"
            @click="
              notify('Дополнительное действие — компонент дизайн-системы')
            "
          >
            Дополнительное <CqIcon name="arrow" />
          </button>
        </div>
        <div class="tags section">
          <CqTag color="green">Завершено</CqTag
          ><CqTag color="gold">Критический навык</CqTag
          ><CqTag color="red">Ошибка</CqTag
          ><CqTag color="outline">Нет данных</CqTag>
        </div>
        <div class="section">
          <CqNotice
            >Рекомендация объясняется проверяемыми фактами, а не абстрактной
            «уверенностью AI».</CqNotice
          >
        </div>
      </section>
      <section class="panel">
        <h2>Сетка и компоненты</h2>
        <div
          v-for="[label, value] in [
            ['Боковая навигация', '236 px'],
            ['Отступ контента', '34 / 18 px'],
            ['Скругление карточек', '20 / 16 px'],
            ['Десктоп / мобильный макет', '1440 / 390 px'],
            ['Состояния', 'Loading · empty · error · 403'],
          ]"
          :key="label"
          class="line-item"
        >
          <span>{{ label }}</span
          ><strong>{{ value }}</strong>
        </div>
      </section>
    </div>
  </div>
</template>
