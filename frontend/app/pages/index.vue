<script setup>
definePageMeta({ alias: ["/dashboard"] });
const { current } = useCareer();
const gaps = computed(() =>
  current.value.p.gaps
    .filter((g) => g.gap > 0)
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.gap - a.gap),
);
</script>
<template>
  <div>
    <CqHeading
      title="Развивайтесь в своём темпе"
      :subtitle="`Здравствуйте, ${current.employee.full_name.split(' ')[0]}. Здесь ваш путь, следующий шаг и прогресс — без лишнего шума.`"
      ><NuxtLink to="/profile" class="btn secondary"
        >Мой профиль <CqIcon name="user" /></NuxtLink
    ></CqHeading>
    <section class="hero">
      <div>
        <div class="eyebrow">
          {{ current.employee.role }} · {{ current.employee.grade }}
        </div>
        <h2>Понятный шаг.<br />Заметный рост.</h2>
        <p>
          Двигайтесь к цели «{{ current.p.goal.target_grade }}» через навыки,
          которые действительно важны для вашей роли.
        </p>
        <div class="actions">
          <NuxtLink to="/path" class="btn gold"
            >Посмотреть мой путь <CqIcon name="arrow" /></NuxtLink
          ><CqTag color="dark">Личная траектория</CqTag>
        </div>
      </div>
      <div class="hero-art"><CqProgress :profile="current.p" /></div>
    </section>
    <div class="grid four stats">
      <CqMetric
        label="Соответствие цели"
        :value="current.p.progress + '%'"
        caption="Не вероятность повышения"
        icon="target"
      /><CqMetric
        label="Требования закрыты"
        :value="`${current.p.met} / ${current.p.gaps.length}`"
        caption="По выбранному профилю роли"
        icon="check"
      /><CqMetric
        label="Критические разрывы"
        :value="current.p.criticalOpen.length"
        caption="Приоритет для следующих шагов"
        icon="layers"
      /><CqMetric
        label="Следующие шаги"
        :value="current.recs.length"
        caption="Доступно прямо сейчас"
        icon="path"
      />
    </div>
    <div class="section panel-head">
      <h2>Ваш следующий шаг</h2>
      <NuxtLink to="/recommendations" class="btn ghost"
        >Все рекомендации <CqIcon name="arrow"
      /></NuxtLink>
    </div>
    <div class="grid main-aside">
      <div>
        <CqRecommendation
          v-if="current.recs.length"
          :rec="current.recs[0]"
          compact
        /><CqNotice v-else color="gold"
          >Доступного шага сейчас нет.
          <NuxtLink to="/path" class="inline-link">Проверьте цель</NuxtLink> или
          обсудите пробелы каталога с HR.</CqNotice
        >
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>Что приблизит к цели</h2>
          <CqIcon name="target" />
        </div>
        <CqSkill v-for="gap in gaps.slice(0, 4)" :key="gap.id" :gap="gap" />
        <div class="skill-legend">
          <span><i />Текущий уровень</span
          ><span><i class="gold" />Критический навык</span>
        </div>
        <div class="section">
          <CqNotice
            >Прогресс рассчитан по требованиям роли, а не по количеству
            пройденных курсов.</CqNotice
          >
        </div>
      </div>
    </div>
    <div class="panel section">
      <div class="panel-head">
        <h2>Последняя активность</h2>
        <NuxtLink to="/activities" class="btn ghost"
          >Вся история <CqIcon name="arrow"
        /></NuxtLink>
      </div>
      <CqRecent :history="current.history" :limit="3" />
    </div>
  </div>
</template>
