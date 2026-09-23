<script setup>
import { t, localeState, apiLocale, catalogText, uiError } from "../utils/i18n.js";
import { date, formats, percent as formatPercent } from "../utils/labels.js";
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
  value == null ? "—" : formatPercent(value * 100);
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
    if (current !== generation) return;
    overview.value = summary.data;
    rows.value = participation.data;
    meta.value = participation.meta;
    activities.value = {};
    loading.value = false;
    const details = await Promise.allSettled(
      participation.data.map((row) =>
        request("/activities/" + encodeURIComponent(row.activityId), {
          query: { locale: apiLocale() },
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
        uiError(cause) || "Не удалось загрузить участие в активностях.";
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
watch(() => localeState.locale, load);
</script>
<template>
  <div>
    <CqHeading
      :title="t('Участие в развивающих активностях')"
      :subtitle="
        t(
          'Анализируйте форматы и доступность, а не наказывайте за отказ от участия.',
        )
      "
    />
    <form class="filters" @submit.prevent="applyFilters">
      <CqDepartment v-model="department" :disabled="loading" />
      <label class="small"
        >{{ t("С")
        }}<input
          v-model="dateFrom"
          type="date"
          class="input"
          :aria-label="t('Начало периода')"
          :max="dateTo || undefined"
          :disabled="loading"
      /></label>
      <label class="small"
        >{{ t("По")
        }}<input
          v-model="dateTo"
          type="date"
          class="input"
          :aria-label="t('Конец периода')"
          :min="dateFrom || undefined"
          :disabled="loading"
      /></label>
      <button class="btn secondary" :disabled="loading">
        {{ t("Применить") }}<CqIcon name="search" />
      </button>
    </form>
    <div v-if="loading" class="panel empty-inline section" role="status">
      {{ t("Загружаем статистику участия…") }}
    </div>
    <section v-else-if="error" class="panel section" role="alert">
      <CqNotice color="red">{{ t(error) }}</CqNotice>
      <button class="btn secondary section" @click="load">
        {{ t("Повторить") }}<CqIcon name="refresh" />
      </button>
    </section>
    <template v-else-if="overview">
      <p class="small muted section">
        {{
          t("Период: {p0} — {p1} · Дата среза: {p2}", {
            p0: date(overview.dateFrom),
            p1: date(overview.dateTo),
            p2: date(overview.asOfDate),
          })
        }}
      </p>
      <div class="grid three section">
        <CqMetric
          :label="t('Активностей с участием')"
          :value="meta.total"
          :caption="t('Обязательные и добровольные')"
          icon="book"
        />
        <CqMetric
          :label="t('Записей участия')"
          :value="overview.participationCount"
          :caption="t('За выбранный период')"
          icon="calendar"
        />
        <CqMetric
          :label="t('Участников')"
          :value="overview.uniqueParticipants"
          :caption="t('Уникальные сотрудники за период')"
          icon="people"
        />
      </div>
      <CqNotice v-if="detailError" color="gold">{{ t(detailError) }}</CqNotice>
      <section class="panel section">
        <div class="panel-head">
          <h2>{{ t("Сводка по мероприятиям") }}</h2>
          <CqTag color="outline">{{
            t("Записи и уникальные участники")
          }}</CqTag>
        </div>
        <div class="table-wrap">
          <table v-if="rows.length">
            <thead>
              <tr>
                <th>{{ t("Активность") }}</th>
                <th>{{ t("Формат") }}</th>
                <th>{{ t("Участий / сотрудников") }}</th>
                <th>{{ t("Завершено") }}</th>
                <th>{{ t("Неявки / пропуски") }}</th>
                <th>{{ t("Завершение") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.activityId">
                <td>
                  <NuxtLink
                    :to="{ path: '/event', query: { id: row.activityId } }"
                    class="text-primary"
                    ><strong>{{
                      catalogText(
                        activities[row.activityId],
                        "title",
                        row.activityId,
                      )
                    }}</strong></NuxtLink
                  >
                  <div class="sub">
                    {{ t(row.activityId)
                    }}<span v-if="activities[row.activityId]?.mandatory">{{
                      t("· Обязательная")
                    }}</span>
                  </div>
                </td>
                <td>
                  {{
                    t(
                      formats[activities[row.activityId]?.format] ||
                        activities[row.activityId]?.format ||
                        "—",
                    )
                  }}
                </td>
                <td>
                  {{ t(row.participationCount) }} /
                  {{ t(row.uniqueParticipants) }}
                </td>
                <td>{{ t(row.statusCounts.COMPLETED ?? 0) }}</td>
                <td>
                  {{ t(row.statusCounts.NO_SHOW ?? 0) }} /
                  {{ t(row.statusCounts.SKIPPED ?? 0) }}
                </td>
                <td>
                  {{ t(percent(row.completionRate)) }}
                  <div class="bar mt-1.5 max-w-24">
                    <span :style="{ width: row.completionRate * 100 + '%' }" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-inline">
            {{
              t(
                "В выбранный период записей участия нет. Измените подразделение или даты.",
              )
            }}
          </div>
        </div>
        <div class="pagination">
          <span>{{ t("Страница {p0} из {p1}", { p0: page, p1: pages }) }}</span>
          <div class="actions">
            <button
              class="btn secondary"
              :disabled="page <= 1"
              @click="turnPage(page - 1)"
            >
              <CqIcon name="back" />{{ t("Назад") }}
            </button>
            <button
              class="btn secondary"
              :disabled="page >= pages"
              @click="turnPage(page + 1)"
            >
              {{ t("Далее") }}<CqIcon name="arrow" />
            </button>
          </div>
        </div>
      </section>
      <div class="section">
        <CqNotice>{{
          t(
            "Доля завершений — завершённые записи / все записи участия в активности за период. В знаменатель входят все статусы, включая участие в процессе. Это описательная метрика, а не оценка качества или ROI программы.",
          )
        }}</CqNotice>
      </div>
    </template>
  </div>
</template>
