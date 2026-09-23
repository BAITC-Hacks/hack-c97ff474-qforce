<script setup>
import { t } from "../utils/i18n.js";
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
      <CqDataWarnings />
      <CqHeading
        :title="t('Развивайтесь в своём темпе')"
        :subtitle="
          t('Здравствуйте, {name}. Здесь ваш путь, следующий шаг и прогресс.', {
            name: store.profile.fullName,
          })
        "
        ><NuxtLink to="/profile" class="btn secondary"
          >{{ t("Мой профиль") }}<CqIcon name="user" /></NuxtLink
      ></CqHeading>
      <section class="hero">
        <div>
          <div class="eyebrow">
            {{ t(roleName(store.profile.roleId)) }} ·
            {{ t(gradeName(store.profile.gradeId)) }}
          </div>
          <h2>{{ t("Понятный шаг.") }}<br />{{ t("Заметный рост.") }}</h2>
          <p>
            {{
              t("{p0}. Следующий грейд: {p1}.", {
                p0: trajectoryStatus[store.trajectory.status],
                p1: gradeName(store.trajectory.nextGradeId),
              })
            }}
          </p>
          <div class="actions">
            <NuxtLink to="/path" class="btn gold"
              >{{ t("Посмотреть мой путь") }}<CqIcon name="arrow" /></NuxtLink
            ><CqTag color="dark">{{ t("Личная траектория") }}</CqTag>
          </div>
        </div>
        <div class="hero-art"><CqProgress :profile="store.trajectory" /></div>
      </section>
      <div class="grid three stats">
        <CqMetric
          :label="t('Соответствие навыков')"
          :value="percent(store.trajectory.readinessPercent)"
          :caption="t('Не вероятность повышения')"
          icon="target"
        />
        <CqMetric
          :label="t('Данные о навыках')"
          :value="percent(store.trajectory.coverage * 100)"
          :caption="t('Покрытие требований известными данными')"
          icon="layers"
        />
        <CqMetric
          :label="t('Критические навыки')"
          :value="
            store.trajectory.criticalSkillsMet === null
              ? 'Нет данных'
              : store.trajectory.criticalSkillsMet
                ? 'Закрыты'
                : 'Есть разрывы'
          "
          :caption="t('По требованиям следующего грейда')"
          icon="check"
        />
      </div>
      <div class="section panel-head">
        <h2>{{ t("Ваш следующий шаг") }}</h2>
        <NuxtLink to="/recommendations" class="btn ghost"
          >{{ t("Все рекомендации") }}<CqIcon name="arrow"
        /></NuxtLink>
      </div>
      <div class="grid main-aside">
        <div>
          <p v-if="store.blockLoading.recommendations" role="status">{{ t("Загружаем рекомендации…") }}</p>
          <CqNotice v-if="store.recommendations?.stale" color="gold">{{
            t("Профиль изменился. Обновите рекомендации.")
          }}</CqNotice>
          <CqRecommendation
            v-if="store.recommendations?.recommendations.length"
            :rec="store.recommendations.recommendations[0]"
            compact
          />
          <section v-else-if="!store.blockLoading.recommendations && !store.blockErrors.recommendations" class="panel">
            <p>
              {{
                t(
                  store.recommendations
                    ? "Подходящих рекомендаций сейчас нет."
                    : "Подбор ещё не выполнялся.",
                )
              }}
            </p>
            <NuxtLink to="/recommendations" class="btn section">{{
              t("Подобрать следующий шаг")
            }}</NuxtLink>
          </section>
        </div>
        <section class="panel">
          <h2>{{ t("Что приблизит к цели") }}</h2>
          <CqSkill
            v-for="gap in gaps.slice(0, 4)"
            :key="gap.skillId"
            :gap="gap"
          />
          <p v-if="!gaps.length" class="empty-inline">
            {{ t(trajectoryStatus[store.trajectory.status]) }}
          </p>
          <CqNotice>{{
            t(
              "Прогресс рассчитан по требованиям роли, а не по количеству курсов.",
            )
          }}</CqNotice>
        </section>
      </div>
      <section class="panel section">
        <div class="panel-head">
          <h2>{{ t("Последняя активность") }}</h2>
          <NuxtLink to="/activities" class="btn ghost"
            >{{ t("Вся история") }}<CqIcon name="arrow"
          /></NuxtLink>
        </div>
        <p v-if="store.blockLoading.history" role="status">{{ t("Загружаем историю…") }}</p>
        <CqRecent v-else-if="!store.blockErrors.history" :history="store.history" :limit="3" />
      </section>
    </div>
  </CqAsync>
</template>
