<script setup>
import { t } from "../utils/i18n.js";
import { percent } from "../utils/labels.js";
const route = useRoute(),
  { store, loadEmployee, skillName, activityName } = useCareer();
onMounted(() => loadEmployee());
const record = computed(() =>
  store.history.find(
    (row) => row.id === route.query.id && row.status === "completed",
  ),
);
const result = computed(() => {
  const value = record.value?.completionResult;
  return value &&
    Array.isArray(value.changedSkills) &&
    value.trajectoryBefore &&
    value.trajectoryAfter
    ? value
    : null;
});
</script>
<template>
  <CqAsync :loading="store.loading" :error="store.error" @retry="loadEmployee()"
    ><div>
      <CqDataWarnings :blocks="['history', 'catalogs']" />
      <p v-if="store.blockLoading.history" role="status">{{ t("Загружаем историю…") }}</p>
      <CqHeading
        :title="t('Результат выполнения')"
        :subtitle="t('Сохранённый результат участия и изменение навыков.')"
      />
      <section v-if="record" class="panel">
        <CqNotice v-if="record.source?.toLowerCase() === 'online'">{{ t('Выполнение отмечено вами. Показанный прирост рассчитан по правилам активности и не является независимой оценкой знаний.') }}</CqNotice>
        <div class="section-kicker">{{ t("Завершено") }}</div>
        <h2>{{ t(activityName(record.activityId)) }}</h2>
        <template v-if="result"
          ><div class="grid two section">
            <CqMetric
              :label="t('До завершения')"
              :value="percent(result.trajectoryBefore.readinessPercent)"
              :caption="t('Соответствие следующему грейду')"
              icon="target"
            /><CqMetric
              :label="t('После завершения')"
              :value="percent(result.trajectoryAfter.readinessPercent)"
              :caption="t('Результат на момент выполнения')"
              icon="check"
            />
          </div>
          <div
            v-for="change in result.changedSkills"
            :key="change.skillId"
            class="line-item"
          >
            <strong>{{ t(skillName(change.skillId)) }}</strong
            ><CqTag color="green"
              >{{ t(change.before) }} → {{ t(change.after) }} (+{{
                t(change.actualGain)
              }})</CqTag
            >
          </div>
          <p v-if="!result.changedSkills.length" class="empty-inline">
            {{ t("Дополнительного прироста навыков нет.") }}
          </p></template
        >
        <CqNotice v-else color="gold">{{
          t(
            "Участие завершено, но подробный результат изменения навыков не сохранён. Так бывает с импортированной историей.",
          )
        }}</CqNotice>
      </section>
      <section v-else-if="!store.blockLoading.history && !store.blockErrors.history" class="panel empty-inline">
        {{
          t(
            "Завершённое участие не найдено. Откройте результат из истории активностей.",
          )
        }}
      </section>
      <div class="actions section">
        <NuxtLink to="/recommendations" class="btn"
          >{{ t("Подобрать следующий шаг") }}<CqIcon name="arrow" /></NuxtLink
        ><NuxtLink to="/activities" class="btn secondary">{{
          t("К истории")
        }}</NuxtLink>
      </div>
    </div></CqAsync
  >
</template>
