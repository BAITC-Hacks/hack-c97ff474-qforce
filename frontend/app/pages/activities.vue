<script setup>
import { t, uiError, message } from "../utils/i18n.js";
import { date, statuses, percent } from "../utils/labels.js";
const { store, loadEmployee, activityName, notify } = useCareer(),
  { request } = useApi();
const filter = ref(""),
  busy = ref(""),
  actionError = ref("");
const keys = new Map();
const rows = computed(() =>
  store.history
    .filter((row) => !filter.value || row.status === filter.value)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date)),
);
const canComplete = (row) =>
  ["registered", "in_progress", "overdue"].includes(row.status);
const scheduleKnown = (row) => !!store.eligible?.asOfDate && store.activities.some(activity => activity.id === row.activityId);
const scheduledFuture = (row) =>
  store.activities.find((a) => a.id === row.activityId)?.format !==
    "self_paced" && row.date > store.eligible?.asOfDate;
onMounted(() => loadEmployee());
async function act(row, status) {
  if (busy.value) return;
  const employeeId = store.profile.id;
  busy.value = row.id;
  actionError.value = "";
  try {
    const base =
      "/employees/" +
      encodeURIComponent(employeeId) +
      "/participations/" +
      encodeURIComponent(row.id);
    if (status === "completed") {
      if (!keys.has(row.id)) keys.set(row.id, crypto.randomUUID());
      const result = await request(base + "/complete", {
        method: "POST",
        body: {},
        headers: { "Idempotency-Key": keys.get(row.id) },
      });
      store.lastCompletion = result.data;
    } else
      await request(base + "/status", { method: "PATCH", body: { status } });
    await loadEmployee(employeeId);
    if (store.error)
      actionError.value = message(
        "Изменение сохранено, но перечитать данные не удалось: {error}",
        { error: store.error },
      );
    else if (status === "completed")
      await navigateTo({ path: "/completion", query: { id: row.id } });
    else notify("Статус участия сохранён.");
  } catch (e) {
    actionError.value = uiError(e);
  } finally {
    busy.value = "";
  }
}
</script>
<template>
  <div>
    <CqHeading
      :title="t('Мои активности')"
      :subtitle="t('План и история участия сохраняются в вашем профиле.')"
      ><NuxtLink to="/catalog" class="btn secondary"
        >{{ t("Найти следующий шаг") }}<CqIcon name="book" /></NuxtLink
    ></CqHeading>
    <CqNotice v-if="actionError" color="red" role="alert">{{
      t(actionError)
    }}</CqNotice>
    <CqAsync
      :loading="store.loading"
      :error="store.error"
      :empty="!store.profile"
      @retry="loadEmployee()"
    >
      <CqDataWarnings />
      <p v-if="store.blockLoading.history" role="status">{{ t("Загружаем историю…") }}</p>
      <div class="filters">
        <select
          v-model="filter"
          class="select"
          :aria-label="t('Статус участия')"
        >
          <option value="">{{ t("Все статусы") }}</option>
          <option v-for="(label, key) in statuses" :key="key" :value="key">
            {{ t(label[0]) }}
          </option>
        </select>
      </div>
      <section class="panel">
        <div v-for="row in rows" :key="row.id" class="activity-entry">
          <div class="activity-line">
            <span class="mini-icon"><CqIcon name="book" /></span>
            <div>
              <NuxtLink
                class="activity-title"
                :to="{ path: '/event', query: { id: row.activityId } }"
                >{{ t(activityName(row.activityId)) }}</NuxtLink
              >
              <div class="activity-date">
                {{ t(date(row.date)) }} · {{ percent(row.completionPct) }}
              </div>
            </div>
            <CqTag :color="statuses[row.status]?.[1]">{{
              t(statuses[row.status]?.[0] || row.status)
            }}</CqTag>
          </div>
          <div class="actions">
            <button
              v-if="['registered', 'overdue'].includes(row.status)"
              class="btn secondary"
              :disabled="!!busy"
              @click="act(row, 'in_progress')"
            >
              {{ t("Начать") }}
            </button>
            <button
              v-if="canComplete(row)"
              class="btn"
              :disabled="!!busy || !scheduleKnown(row) || store.blockLoading.eligible || !!store.blockErrors.eligible || !!store.blockErrors.catalogs || scheduledFuture(row)"
              @click="act(row, 'completed')"
            >
              {{ t(busy === row.id ? "Сохраняем…" : "Завершить") }}
            </button>
            <button
              v-if="['registered', 'overdue'].includes(row.status)"
              class="btn ghost"
              :disabled="!!busy"
              @click="act(row, 'declined')"
            >
              {{ t("Отказаться") }}
            </button>
            <button
              v-if="['in_progress', 'overdue'].includes(row.status)"
              class="btn ghost"
              :disabled="!!busy"
              @click="act(row, 'dropped')"
            >
              {{ t("Прервать") }}
            </button>
            <button
              v-if="
                row.status === 'registered' &&
                scheduleKnown(row) &&
                !scheduledFuture(row) &&
                store.activities.find((a) => a.id === row.activityId)
                  ?.format !== 'self_paced'
              "
              class="btn ghost"
              :disabled="!!busy"
              @click="act(row, 'no_show')"
            >
              {{ t("Не участвовал") }}
            </button>
            <NuxtLink
              v-if="row.status === 'completed'"
              :to="{ path: '/completion', query: { id: row.id } }"
              class="btn ghost"
              >{{ t("Результат выполнения") }}<CqIcon name="arrow"
            /></NuxtLink>
          </div>
          <p
            v-if="canComplete(row) && scheduledFuture(row)"
            class="small muted section"
          >
            {{ t("Завершение станет доступно после даты сессии.") }}
          </p>
        </div>
        <p v-if="!rows.length && !store.blockLoading.history && !store.blockErrors.history" class="empty-inline">
          {{ t("Участий с таким статусом пока нет.") }}
        </p>
      </section>
    </CqAsync>
  </div>
</template>
