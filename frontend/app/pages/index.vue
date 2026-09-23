<script setup>
import { percent, trajectoryStatus } from "../utils/labels.js";
definePageMeta({ alias: ["/dashboard"] });
const { store, loadEmployee, gradeName, roleName } = useCareer();
onMounted(() => loadEmployee());
const gaps = computed(() =>
  (store.trajectory?.gaps || [])
    .filter((g) => g.gap === null || g.gap > 0)
    .sort((a, b) => Number(b.critical) - Number(a.critical)),
);
</script>
<template>
  <CqAsync
    :loading="store.loading"
    :error="store.error"
    :empty="!store.profile"
    @retry="loadEmployee()"
  >
    <div v-if="store.profile">
      <CqHeading
        title="Развивайтесь в своём темпе"
        :subtitle="
          'Здравствуйте, ' +
          store.profile.fullName +
          '. Здесь ваш путь, следующий шаг и прогресс.'
        "
        ><NuxtLink to="/profile" class="btn secondary"
          >Мой профиль <CqIcon name="user" /></NuxtLink
      ></CqHeading>
      <section class="hero">
        <div>
          <div class="eyebrow">
            {{ roleName(store.profile.roleId) }} ·
            {{ gradeName(store.profile.gradeId) }}
          </div>
          <h2>Понятный шаг.<br />Заметный рост.</h2>
          <p>
            {{ trajectoryStatus[store.trajectory.status] }}. Следующий грейд:
            {{ gradeName(store.trajectory.nextGradeId) }}.
          </p>
          <div class="actions">
            <NuxtLink to="/path" class="btn gold"
              >Посмотреть мой путь <CqIcon name="arrow" /></NuxtLink
            ><CqTag color="dark">Личная траектория</CqTag>
          </div>
        </div>
        <div class="hero-art"><CqProgress :profile="store.trajectory" /></div>
      </section>
      <div class="grid three stats">
        <CqMetric
          label="Соответствие навыков"
          :value="percent(store.trajectory.readinessPercent)"
          caption="Не вероятность повышения"
          icon="target"
        />
        <CqMetric
          label="Данные о навыках"
          :value="percent(store.trajectory.coverage * 100)"
          caption="Покрытие требований известными данными"
          icon="layers"
        />
        <CqMetric
          label="Критические навыки"
          :value="
            store.trajectory.criticalSkillsMet === null
              ? 'Нет данных'
              : store.trajectory.criticalSkillsMet
                ? 'Закрыты'
                : 'Есть разрывы'
          "
          caption="По требованиям следующего грейда"
          icon="check"
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
          <CqNotice v-if="store.recommendations?.stale" color="gold"
            >Профиль изменился. Обновите рекомендации.</CqNotice
          >
          <CqRecommendation
            v-if="store.recommendations?.recommendations.length"
            :rec="store.recommendations.recommendations[0]"
            compact
          />
          <section v-else class="panel">
            <p>
              {{
                store.recommendations
                  ? "Подходящих рекомендаций сейчас нет."
                  : "Подбор ещё не выполнялся."
              }}
            </p>
            <NuxtLink to="/recommendations" class="btn section"
              >Подобрать следующий шаг</NuxtLink
            >
          </section>
        </div>
        <section class="panel">
          <h2>Что приблизит к цели</h2>
          <CqSkill
            v-for="gap in gaps.slice(0, 4)"
            :key="gap.skillId"
            :gap="gap"
          />
          <p v-if="!gaps.length" class="empty-inline">
            {{ trajectoryStatus[store.trajectory.status] }}
          </p>
          <CqNotice
            >Прогресс рассчитан по требованиям роли, а не по количеству
            курсов.</CqNotice
          >
        </section>
      </div>
      <section class="panel section">
        <div class="panel-head">
          <h2>Последняя активность</h2>
          <NuxtLink to="/activities" class="btn ghost"
            >Вся история <CqIcon name="arrow"
          /></NuxtLink>
        </div>
        <CqRecent :history="store.history" :limit="3" />
      </section>
    </div>
  </CqAsync>
</template>
