<script setup>
import { date, formats } from "../utils/labels.js";
const { request } = useApi();
const department = ref(""),
  dateFrom = ref(""),
  dateTo = ref("");
const filters = ref({}),
  rows = ref([]),
  overview = ref(null),
  meta = ref({ total: 0 });
const page = ref(1),
  pageSize = 10,
  loading = ref(false),
  error = ref(""),
  detailError = ref("");
const activities = ref({});
const pages = computed(() =>
  Math.max(1, Math.ceil(meta.value.total / pageSize)),
);
const percent = (value) =>
  value == null ? "—" : Math.round(value * 100) + "%";
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  detailError.value = "";
  try {
    const [summary, participation] = await Promise.all([
      request("/hr/overview", { query: filters.value }),
      request("/hr/activity-participation", {
        query: { ...filters.value, page: page.value, pageSize },
      }),
    ]);
    const details = await Promise.allSettled(
      participation.data.map((row) =>
        request("/activities/" + encodeURIComponent(row.activityId), {
          query: { locale: "ru" },
        }),
      ),
    );
    if (current !== generation) return;
    overview.value = summary.data;
    rows.value = participation.data;
    meta.value = participation.meta;
    activities.value = Object.fromEntries(
      details
        .filter((result) => result.status === "fulfilled")
        .map((result) => [result.value.data.id, result.value.data]),
    );
    if (details.some((result) => result.status === "rejected"))
      detailError.value =
        "Названия некоторых активностей недоступны. Статистика показана по их идентификаторам.";
  } catch (cause) {
    if (current === generation)
      error.value =
        cause.message || "Не удалось загрузить участие в активностях.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
function applyFilters() {
  filters.value = {
    department: department.value.trim() || undefined,
    dateFrom: dateFrom.value || undefined,
    dateTo: dateTo.value || undefined,
  };
  page.value = 1;
  load();
}
function turnPage(value) {
  page.value = value;
  load();
}
onMounted(load);
</script>
<template>
  <div>
    <CqHeading
      title="Участие в развивающих активностях"
      subtitle="Анализируйте форматы и доступность, а не наказывайте за отказ от участия."
    />
    <form class="filters" @submit.prevent="applyFilters">
      <CqDepartment v-model="department" :disabled="loading" />
      <label class="small"
        >С
        <input
          v-model="dateFrom"
          type="date"
          class="input"
          aria-label="Начало периода"
          :max="dateTo || undefined"
          :disabled="loading"
      /></label>
      <label class="small"
        >По
        <input
          v-model="dateTo"
          type="date"
          class="input"
          aria-label="Конец периода"
          :min="dateFrom || undefined"
          :disabled="loading"
      /></label>
      <button class="btn secondary" :disabled="loading">
        Применить <CqIcon name="search" />
      </button>
    </form>
    <div v-if="loading" class="panel empty-inline section" role="status">
      Загружаем статистику участия…
    </div>
    <section v-else-if="error" class="panel section" role="alert">
      <CqNotice color="red">{{ error }}</CqNotice>
      <button class="btn secondary section" @click="load">
        Повторить <CqIcon name="refresh" />
      </button>
    </section>
    <template v-else-if="overview">
      <p class="small muted section">
        Период: {{ date(overview.dateFrom) }} — {{ date(overview.dateTo) }} ·
        Дата среза: {{ date(overview.asOfDate) }}
      </p>
      <div class="grid three section">
        <CqMetric
          label="Активностей с участием"
          :value="meta.total"
          caption="Обязательные и добровольные"
          icon="book"
        />
        <CqMetric
          label="Записей участия"
          :value="overview.participationCount"
          caption="За выбранный период"
          icon="calendar"
        />
        <CqMetric
          label="Участников"
          :value="overview.uniqueParticipants"
          caption="Уникальные сотрудники за период"
          icon="people"
        />
      </div>
      <CqNotice v-if="detailError" color="gold">{{ detailError }}</CqNotice>
      <section class="panel section">
        <div class="panel-head">
          <h2>Сводка по мероприятиям</h2>
          <CqTag color="outline">Записи и уникальные участники</CqTag>
        </div>
        <div class="table-wrap">
          <table v-if="rows.length">
            <thead>
              <tr>
                <th>Активность</th>
                <th>Формат</th>
                <th>Участий / сотрудников</th>
                <th>Завершено</th>
                <th>Неявки / пропуски</th>
                <th>Завершение</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.activityId">
                <td>
                  <NuxtLink
                    :to="{ path: '/event', query: { id: row.activityId } }"
                    class="text-primary"
                    ><strong>{{
                      activities[row.activityId]?.title || row.activityId
                    }}</strong></NuxtLink
                  >
                  <div class="sub">
                    {{ row.activityId
                    }}<span v-if="activities[row.activityId]?.mandatory">
                      · Обязательная</span
                    >
                  </div>
                </td>
                <td>
                  {{
                    formats[activities[row.activityId]?.format] ||
                    activities[row.activityId]?.format ||
                    "—"
                  }}
                </td>
                <td>
                  {{ row.participationCount }} / {{ row.uniqueParticipants }}
                </td>
                <td>{{ row.statusCounts.COMPLETED ?? 0 }}</td>
                <td>
                  {{ row.statusCounts.NO_SHOW ?? 0 }} /
                  {{ row.statusCounts.SKIPPED ?? 0 }}
                </td>
                <td>
                  {{ percent(row.completionRate) }}
                  <div class="bar mt-1.5 max-w-24">
                    <span :style="{ width: row.completionRate * 100 + '%' }" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-inline">
            В выбранный период записей участия нет. Измените подразделение или
            даты.
          </div>
        </div>
        <div class="pagination">
          <span>Страница {{ page }} из {{ pages }}</span>
          <div class="actions">
            <button
              class="btn secondary"
              :disabled="page <= 1"
              @click="turnPage(page - 1)"
            >
              <CqIcon name="back" /> Назад
            </button>
            <button
              class="btn secondary"
              :disabled="page >= pages"
              @click="turnPage(page + 1)"
            >
              Далее <CqIcon name="arrow" />
            </button>
          </div>
        </div>
      </section>
      <div class="section">
        <CqNotice
          >Доля завершений — завершённые записи / все записи участия в
          активности за период. В знаменатель входят все статусы, включая
          участие в процессе. Это описательная метрика, а не оценка качества или
          ROI программы.</CqNotice
        >
      </div>
    </template>
  </div>
</template>
