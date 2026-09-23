<script setup>
import { date } from "../utils/labels.js";
const { request } = useApi();
const department = ref(""),
  dateFrom = ref(""),
  dateTo = ref("");
const filters = ref({}),
  overview = ref(null),
  gaps = ref([]),
  attention = ref([]);
const gapMeta = ref({ total: 0 }),
  attentionMeta = ref({ total: 0 }),
  coverage = ref({});
const skills = ref([]),
  roles = ref([]);
const gapPage = ref(1),
  attentionPage = ref(1),
  pageSize = 10;
const loading = ref(false),
  error = ref(""),
  catalogError = ref("");
const gapPages = computed(() =>
  Math.max(1, Math.ceil(gapMeta.value.total / pageSize)),
);
const attentionPages = computed(() =>
  Math.max(1, Math.ceil(attentionMeta.value.total / pageSize)),
);
const nameOf = (catalog, id) =>
  catalog.find((item) => item.id === id)?.name || id;
const percentage = (value) =>
  value == null ? "—" : Math.round(value * 100) + "%";
const reasons = {
  INCOMPLETE_REQUIREMENTS_OR_LEVELS: "Не хватает требований или оценок навыков",
  NO_ELIGIBLE_ACTIVITIES: "Нет доступных активностей",
  NO_PARTICIPATION_IN_WINDOW: "Нет записей участия за период",
  REPEATED_SKIPS_IN_WINDOW: "Повторные пропуски за период",
};
const coverageLabels = {
  NOT_GENERATED: "Рекомендации ещё не сформированы",
  FRESH: "Актуальные рекомендации",
  STALE: "Рекомендации требуют обновления",
  NO_ELIGIBLE_ACTIVITIES: "Нет доступных активностей",
  DATA_INCOMPLETE: "Неполные данные",
  NO_NEXT_GRADE: "Следующий грейд не задан",
};
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const [summary, skillGaps, needsAttention, recommendations] =
      await Promise.all([
        request("/hr/overview", { query: filters.value }),
        request("/hr/skill-gaps", {
          query: { ...filters.value, page: gapPage.value, pageSize },
        }),
        request("/hr/needs-attention", {
          query: { ...filters.value, page: attentionPage.value, pageSize },
        }),
        request("/hr/recommendation-coverage", {
          query: { ...filters.value, page: 1, pageSize: 1 },
        }),
      ]);
    if (current !== generation) return;
    overview.value = summary.data;
    gaps.value = skillGaps.data;
    gapMeta.value = skillGaps.meta;
    attention.value = needsAttention.data;
    attentionMeta.value = needsAttention.meta;
    coverage.value = recommendations.meta.counts;
  } catch (cause) {
    if (current === generation)
      error.value = cause.message || "Не удалось загрузить аналитику.";
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
  gapPage.value = 1;
  attentionPage.value = 1;
  load();
}
function paginate(section, page) {
  if (section === "gaps") gapPage.value = page;
  else attentionPage.value = page;
  load();
}
onMounted(async () => {
  const results = await Promise.allSettled([
    load(),
    request("/skills", { query: { locale: "ru" } }),
    request("/roles", { query: { locale: "ru" } }),
  ]);
  if (results[1].status === "fulfilled") skills.value = results[1].value.data;
  if (results[2].status === "fulfilled") roles.value = results[2].value.data;
  if (results.slice(1).some((result) => result.status === "rejected"))
    catalogError.value =
      "Некоторые названия недоступны. Показаны исходные идентификаторы.";
});
</script>
<template>
  <div>
    <CqHeading
      title="Команда растёт. Вы видите — как."
      subtitle="Разрывы по компетенциям, доступность развития и участие — без рейтингов людей."
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
    <CqNotice v-if="catalogError" color="gold">{{ catalogError }}</CqNotice>
    <div v-if="loading" class="panel empty-inline section" role="status">
      Загружаем HR-аналитику…
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
      <div class="grid four section">
        <CqMetric
          label="Сотрудников"
          :value="overview.employeeCount"
          caption="В выбранном подразделении"
          icon="people"
        />
        <CqMetric
          label="Доступен следующий шаг"
          :value="overview.employeesWithEligibleNextStep"
          caption="По условиям доступности каталога"
          icon="path"
        />
        <CqMetric
          label="Участников"
          :value="overview.uniqueParticipants"
          caption="Уникальные сотрудники за период"
          icon="target"
        />
        <CqMetric
          label="Завершение участия"
          :value="percentage(overview.completionRate)"
          :caption="
            overview.completedParticipations +
            ' из ' +
            overview.participationCount +
            ' записей'
          "
          icon="check"
        />
      </div>
      <div class="grid main-aside section">
        <section class="panel">
          <div class="panel-head">
            <h2>Разрывы по навыкам</h2>
            <CqTag color="outline">{{ gapMeta.total }} групп</CqTag>
          </div>
          <div v-if="!gaps.length" class="empty-inline">
            Нет требований для анализа в этой выборке.
          </div>
          <div
            v-for="row in gaps"
            :key="
              [
                row.skillId,
                row.roleId,
                row.currentGradeId,
                row.targetGradeId,
              ].join(':')
            "
            class="section"
          >
            <div class="chart-row">
              <div>
                {{ nameOf(skills, row.skillId) }}
                <div class="sub">
                  {{ nameOf(roles, row.roleId) }} · {{ row.currentGradeId }} →
                  {{ row.targetGradeId }}
                </div>
              </div>
              <div class="bar">
                <span
                  :style="{
                    width:
                      (row.deficitShare == null ? 0 : row.deficitShare * 100) +
                      '%',
                  }"
                />
              </div>
              <strong>{{ percentage(row.deficitShare) }}</strong>
            </div>
            <p class="small muted">
              Разрыв: {{ row.employeesWithGap }} из
              {{ row.knownLevelEmployees }} сотрудников с известным уровнем. Нет
              оценки: {{ row.incompleteDataEmployees }}.
            </p>
          </div>
          <p class="small muted section">
            Доля относится к сотрудникам с применимым требованием и известным
            уровнем навыка. Требования не заданы для
            {{ gapMeta.employeesWithoutTargetRequirements }} сотрудников со
            следующим грейдом.
          </p>
          <div v-if="gapPages > 1" class="pagination">
            <span>{{ gapPage }} / {{ gapPages }}</span>
            <div class="actions">
              <button
                class="btn secondary"
                :disabled="gapPage <= 1"
                aria-label="Предыдущая страница навыков"
                @click="paginate('gaps', gapPage - 1)"
              >
                <CqIcon name="back" />
              </button>
              <button
                class="btn secondary"
                :disabled="gapPage >= gapPages"
                aria-label="Следующая страница навыков"
                @click="paginate('gaps', gapPage + 1)"
              >
                <CqIcon name="arrow" />
              </button>
            </div>
          </div>
        </section>
        <div class="stack">
          <section class="panel bg-[#EDF5E8]">
            <div class="section-kicker">Внимание HR</div>
            <h2>У развития бывают препятствия</h2>
            <p class="small muted section">
              Отсутствие рекомендации может означать пробел в каталоге,
              ограничения аудитории или неполные данные. Эти сигналы не
              оценивают мотивацию сотрудника.
            </p>
            <NuxtLink to="/hr-people" class="btn section"
              >Посмотреть сотрудников <CqIcon name="people"
            /></NuxtLink>
          </section>
          <section class="panel">
            <div class="panel-head">
              <h2>Доступность рекомендаций</h2>
              <CqIcon name="chart" />
            </div>
            <div
              v-for="(label, status) in coverageLabels"
              :key="status"
              class="legend-row"
            >
              <span class="small">{{ label }}</span
              ><strong>{{ coverage[status] }}</strong>
            </div>
          </section>
        </div>
      </div>
      <section class="panel section">
        <div class="panel-head">
          <h2>Сигналы для внимания HR</h2>
          <CqTag color="outline">{{ attentionMeta.total }} сотрудников</CqTag>
        </div>
        <div class="table-wrap">
          <table v-if="attention.length">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Роль / грейд</th>
                <th>Наблюдаемые сигналы</th>
                <th>Участий</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in attention" :key="row.employeeId">
                <td>
                  <strong>{{ row.employeeId }}</strong>
                </td>
                <td>
                  {{ nameOf(roles, row.roleId) }}
                  <div class="sub">{{ row.gradeId }}</div>
                </td>
                <td>
                  <div
                    v-for="reason in row.reasons"
                    :key="reason"
                    class="small"
                  >
                    {{ reasons[reason] || reason }}
                  </div>
                </td>
                <td>
                  {{ row.recordedParticipations }}
                  <div class="sub">
                    Пропусков: {{ row.skippedParticipations }}
                  </div>
                </td>
                <td>
                  <NuxtLink
                    :to="{
                      path: '/hr-employee',
                      query: { id: row.employeeId },
                    }"
                    class="btn ghost"
                    >Открыть <CqIcon name="arrow"
                  /></NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-inline">
            В выбранной выборке нет сигналов для внимания HR.
          </div>
        </div>
        <div class="pagination">
          <span>Страница {{ attentionPage }} из {{ attentionPages }}</span>
          <div class="actions">
            <button
              class="btn secondary"
              :disabled="attentionPage <= 1"
              @click="paginate('attention', attentionPage - 1)"
            >
              <CqIcon name="back" /> Назад
            </button>
            <button
              class="btn secondary"
              :disabled="attentionPage >= attentionPages"
              @click="paginate('attention', attentionPage + 1)"
            >
              Далее <CqIcon name="arrow" />
            </button>
          </div>
        </div>
      </section>
      <div class="section">
        <CqNotice
          >Доля завершений рассчитана по всем записям участия за период, включая
          обязательные активности и незавершённые записи. Это описание участия,
          а не оценка эффективности сотрудника.</CqNotice
        >
      </div>
    </template>
  </div>
</template>
