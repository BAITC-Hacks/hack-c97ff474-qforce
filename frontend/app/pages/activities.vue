<script setup>
import { date, statuses } from "../utils/labels.js";
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
      actionError.value =
        "Изменение сохранено, но перечитать данные не удалось: " + store.error;
    else if (status === "completed")
      await navigateTo({ path: "/completion", query: { id: row.id } });
    else notify("Статус участия сохранён.");
  } catch (e) {
    actionError.value = e.message;
  } finally {
    busy.value = "";
  }
}
</script>
<template>
  <div>
    <CqHeading
      title="Мои активности"
      subtitle="План и история участия сохраняются в вашем профиле."
      ><NuxtLink to="/catalog" class="btn secondary"
        >Найти следующий шаг <CqIcon name="book" /></NuxtLink
    ></CqHeading>
    <CqNotice v-if="actionError" color="red" role="alert">{{
      actionError
    }}</CqNotice>
    <CqAsync
      :loading="store.loading"
      :error="store.error"
      :empty="!store.profile"
      @retry="loadEmployee()"
    >
      <div class="filters">
        <select v-model="filter" class="select" aria-label="Статус участия">
          <option value="">Все статусы</option>
          <option v-for="(label, key) in statuses" :key="key" :value="key">
            {{ label[0] }}
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
                >{{ activityName(row.activityId) }}</NuxtLink
              >
              <div class="activity-date">
                {{ date(row.date) }} · {{ row.completionPct }}%
              </div>
            </div>
            <CqTag :color="statuses[row.status]?.[1]">{{
              statuses[row.status]?.[0] || row.status
            }}</CqTag>
          </div>
          <div class="actions">
            <button
              v-if="['registered', 'overdue'].includes(row.status)"
              class="btn secondary"
              :disabled="!!busy"
              @click="act(row, 'in_progress')"
            >
              Начать
            </button>
            <button
              v-if="canComplete(row)"
              class="btn"
              :disabled="!!busy || scheduledFuture(row)"
              @click="act(row, 'completed')"
            >
              {{ busy === row.id ? "Сохраняем…" : "Завершить" }}
            </button>
            <button
              v-if="['registered', 'overdue'].includes(row.status)"
              class="btn ghost"
              :disabled="!!busy"
              @click="act(row, 'declined')"
            >
              Отказаться
            </button>
            <button
              v-if="['in_progress', 'overdue'].includes(row.status)"
              class="btn ghost"
              :disabled="!!busy"
              @click="act(row, 'dropped')"
            >
              Прервать
            </button>
            <button
              v-if="
                row.status === 'registered' &&
                !scheduledFuture(row) &&
                store.activities.find((a) => a.id === row.activityId)
                  ?.format !== 'self_paced'
              "
              class="btn ghost"
              :disabled="!!busy"
              @click="act(row, 'no_show')"
            >
              Не участвовал
            </button>
            <NuxtLink
              v-if="row.status === 'completed'"
              :to="{ path: '/completion', query: { id: row.id } }"
              class="btn ghost"
              >Результат выполнения <CqIcon name="arrow"
            /></NuxtLink>
          </div>
          <p
            v-if="canComplete(row) && scheduledFuture(row)"
            class="small muted section"
          >
            Завершение станет доступно после даты сессии.
          </p>
        </div>
        <p v-if="!rows.length" class="empty-inline">
          Участий с таким статусом пока нет.
        </p>
      </section>
    </CqAsync>
  </div>
</template>
