<script setup>
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
      <CqHeading
        title="Результат выполнения"
        subtitle="Сохранённый результат участия и изменение навыков."
      />
      <section v-if="record" class="panel">
        <div class="section-kicker">Завершено</div>
        <h2>{{ activityName(record.activityId) }}</h2>
        <template v-if="result"
          ><div class="grid two section">
            <CqMetric
              label="До завершения"
              :value="percent(result.trajectoryBefore.readinessPercent)"
              caption="Соответствие следующему грейду"
              icon="target"
            /><CqMetric
              label="После завершения"
              :value="percent(result.trajectoryAfter.readinessPercent)"
              caption="Результат на момент выполнения"
              icon="check"
            />
          </div>
          <div
            v-for="change in result.changedSkills"
            :key="change.skillId"
            class="line-item"
          >
            <strong>{{ skillName(change.skillId) }}</strong
            ><CqTag color="green"
              >{{ change.before }} → {{ change.after }} (+{{
                change.actualGain
              }})</CqTag
            >
          </div>
          <p v-if="!result.changedSkills.length" class="empty-inline">
            Дополнительного прироста навыков нет.
          </p></template
        >
        <CqNotice v-else color="gold"
          >Участие завершено, но подробный результат изменения навыков не
          сохранён. Так бывает с импортированной историей.</CqNotice
        >
      </section>
      <section v-else class="panel empty-inline">
        Завершённое участие не найдено. Откройте результат из истории
        активностей.
      </section>
      <div class="actions section">
        <NuxtLink to="/recommendations" class="btn"
          >Подобрать следующий шаг <CqIcon name="arrow" /></NuxtLink
        ><NuxtLink to="/activities" class="btn secondary">К истории</NuxtLink>
      </div>
    </div></CqAsync
  >
</template>
