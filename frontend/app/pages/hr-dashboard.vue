<script setup>
import { t, localeState, apiLocale, catalogText, number as n } from "../utils/i18n.js";
import { date, percent } from "../utils/labels.js";
import { createHrAnalytics } from "../utils/hr-analytics.js";
const { request } = useApi();
const { blocks, loadBlock } = createHrAnalytics(request);
const department = ref(""),
  dateFrom = ref(""),
  dateTo = ref("");
const filters = ref({});
const overview = computed(() => blocks.overview.data);
const gaps = computed(() => blocks.gaps.data || []);
const attention = computed(() => blocks.attention.data || []);
const gapMeta = computed(() => blocks.gaps.meta);
const attentionMeta = computed(() => blocks.attention.meta);
const coverage = computed(() => blocks.coverage.meta.counts || {});
const skills = ref([]),
  roles = ref([]);
const gapPage = ref(1),
  attentionPage = ref(1),
  pageSize = 10;
const catalogError = ref("");
const gapPages = computed(() =>
  Math.max(1, Math.ceil((gapMeta.value.total || 0) / pageSize)),
);
const attentionPages = computed(() =>
  Math.max(1, Math.ceil((attentionMeta.value.total || 0) / pageSize)),
);
const nameOf = (catalog, id) =>
  catalogText(catalog.find((item) => item.id === id), "name", id);
const percentage = (value) =>
  value == null ? "—" : percent(value * 100);
const reasons = {
  INCOMPLETE_REQUIREMENTS_OR_LEVELS: "Не хватает требований или оценок навыков",
  NO_ELIGIBLE_ACTIVITIES: "Нет доступных активностей",
  NO_PARTICIPATION_IN_WINDOW: "Нет записей участия за период",
  NO_VOLUNTARY_PARTICIPATION_IN_WINDOW: "Нет записей необязательного обучения за период",
  REPEATED_DROPS_IN_WINDOW: "Повторные прерывания за период",
  REPEATED_DECLINES_IN_WINDOW: "Повторные отказы за период",
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
function loadSection(key) {
  return loadBlock(key, { ...filters.value, ...(key === 'overview' ? {} : {
    page: key === 'gaps' ? gapPage.value : key === 'attention' ? attentionPage.value : 1,
    pageSize: key === 'coverage' ? 1 : pageSize,
  }) });
}
function load() {
  return Promise.all(['overview', 'gaps', 'attention', 'coverage'].map(loadSection));
}
function applyFilters() {
  filters.value = {
    department: department.value.trim() || undefined,
    dateFrom: dateFrom.value || undefined,
    dateTo: dateTo.value || undefined,
  };
  gapPage.value = 1;
  attentionPage.value = 1;
  void load();
}
function paginate(section, page) {
  if (section === "gaps") gapPage.value = page;
  else attentionPage.value = page;
  void loadSection(section);
}
let catalogGeneration = 0;
async function initialize() {
  const version = ++catalogGeneration;
  catalogError.value = "";
  const results = await Promise.allSettled([
    request("/skills", { query: { locale: apiLocale() } }),
    request("/roles", { query: { locale: apiLocale() } }),
  ]);
  if (version !== catalogGeneration) return;
  if (results[0].status === "fulfilled") skills.value = results[0].value.data;
  if (results[1].status === "fulfilled") roles.value = results[1].value.data;
  if (results.some((result) => result.status === "rejected"))
    catalogError.value =
      "Некоторые названия недоступны. Показаны исходные идентификаторы.";
}
onMounted(() => { void load(); void initialize(); });
watch(() => localeState.locale, initialize);
</script>
<template>
  <div>
    <CqHeading
      :title="t('Команда растёт. Вы видите — как.')"
      :subtitle="
        t(
          'Разрывы по компетенциям, доступность развития и участие — без рейтингов людей.',
        )
      "
    />
    <form class="filters" @submit.prevent="applyFilters">
      <CqDepartment v-model="department" />
      <label class="small"
        >{{ t("С")
        }}<input
          v-model="dateFrom"
          type="date"
          class="input"
          :aria-label="t('Начало периода')"
          :max="dateTo || undefined"
      /></label>
      <label class="small"
        >{{ t("По")
        }}<input
          v-model="dateTo"
          type="date"
          class="input"
          :aria-label="t('Конец периода')"
          :min="dateFrom || undefined"
      /></label>
      <button class="btn secondary">
        {{ t("Применить") }}<CqIcon name="search" />
      </button>
    </form>
    <CqNotice v-if="catalogError" color="gold">{{ t(catalogError) }}</CqNotice>
    <section data-testid="hr-overview" class="section">
      <CqAsync :loading="blocks.overview.loading" :error="blocks.overview.error" @retry="loadSection('overview')">
      <template v-if="overview">
      <p class="small muted section">
        {{
          t("Период: {p0} — {p1} · Дата среза: {p2}", {
            p0: date(overview.dateFrom),
            p1: date(overview.dateTo),
            p2: date(overview.asOfDate),
          })
        }}
      </p>
      <div class="grid four section">
        <CqMetric
          :label="t('Сотрудников')"
          :value="overview.employeeCount"
          :caption="t('В выбранном подразделении')"
          icon="people"
        />
        <CqMetric
          :label="t('Доступен следующий шаг')"
          :value="overview.employeesWithEligibleNextStep"
          :caption="t('По условиям доступности каталога')"
          icon="path"
        />
        <CqMetric
          :label="t('Участников')"
          :value="overview.uniqueParticipants"
          :caption="t('Уникальные сотрудники за период')"
          icon="target"
        />
        <CqMetric
          :label="t('Завершение участия')"
          :value="percentage(overview.completionRate)"
          :caption="
            t('Завершено {completed} из {total} записей', {
              completed: overview.completedParticipations,
              total: overview.participationCount,
            })
          "
          icon="check"
        />
      </div>
      <div class="grid two section" data-testid="participation-breakdown">
        <section v-for="kind in ['voluntary', 'mandatory']" :key="kind" class="panel">
          <h3>{{ t(kind === 'voluntary' ? 'Необязательное обучение' : 'Обязательное обучение') }}</h3>
          <template v-if="overview.participationByRequirement?.[kind]">
            <p class="section">{{ t('Завершено {completed} из {total} записей', { completed: overview.participationByRequirement[kind].completedParticipations, total: overview.participationByRequirement[kind].participationCount }) }}</p>
            <strong>{{ percentage(overview.participationByRequirement[kind].completionRate) }}</strong>
            <p class="small muted">{{ t('Уникальных участников: {count}', { count: overview.participationByRequirement[kind].uniqueParticipants }) }}</p>
          </template>
        </section>
      </div>
      <CqNotice class="section">{{ t('Разрез задан признаком обязательности активности. Необязательная активность могла быть назначена руководителем; эти числа не доказывают добровольный выбор или мотивацию.') }}</CqNotice>
      <CqNotice v-if="overview.participationByRequirement?.unclassified.participationCount" color="gold">{{ t('Записи без доступного типа активности: {count}. Они включены только в общий итог.', { count: overview.participationByRequirement.unclassified.participationCount }) }}</CqNotice>
      </template>
      </CqAsync>
    </section>
      <div class="grid main-aside section">
        <section class="panel" data-testid="hr-gaps">
          <div class="panel-head">
            <h2>{{ t("Разрывы по навыкам") }}</h2>
            <CqTag v-if="blocks.gaps.data" color="outline">{{
              t("{p0} групп", { p0: gapMeta.total })
            }}</CqTag>
          </div>
          <CqAsync :loading="blocks.gaps.loading" :error="blocks.gaps.error" @retry="loadSection('gaps')">
          <div v-if="!gaps.length" class="empty-inline">
            {{ t("Нет требований для анализа в этой выборке.") }}
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
                {{ t(nameOf(skills, row.skillId)) }}
                <div class="sub">
                  {{ t(nameOf(roles, row.roleId)) }} ·
                  {{ t(row.currentGradeId) }} →
                  {{ t(row.targetGradeId) }}
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
              <strong>{{ t(percentage(row.deficitShare)) }}</strong>
            </div>
            <p class="small muted">
              {{
                t(
                  "Разрыв: {p0} из {p1} сотрудников с известным уровнем. Нет оценки: {p2}.",
                  {
                    p0: row.employeesWithGap,
                    p1: row.knownLevelEmployees,
                    p2: row.incompleteDataEmployees,
                  },
                )
              }}
            </p>
          </div>
          <p class="small muted section">
            {{
              t(
                "Доля относится к сотрудникам с применимым требованием и известным уровнем навыка. Требования не заданы для {p0} сотрудников со следующим грейдом.",
                { p0: gapMeta.employeesWithoutTargetRequirements },
              )
            }}
          </p>
          <div v-if="gapPages > 1" class="pagination">
            <span>{{ t(gapPage) }} / {{ t(gapPages) }}</span>
            <div class="actions">
              <button
                class="btn secondary"
                :disabled="gapPage <= 1"
                :aria-label="t('Предыдущая страница навыков')"
                @click="paginate('gaps', gapPage - 1)"
              >
                <CqIcon name="back" />
              </button>
              <button
                class="btn secondary"
                :disabled="gapPage >= gapPages"
                :aria-label="t('Следующая страница навыков')"
                @click="paginate('gaps', gapPage + 1)"
              >
                <CqIcon name="arrow" />
              </button>
            </div>
          </div>
          </CqAsync>
        </section>
        <div class="stack">
          <section class="panel bg-[#EDF5E8]">
            <div class="section-kicker">{{ t("Внимание HR") }}</div>
            <h2>{{ t("У развития бывают препятствия") }}</h2>
            <p class="small muted section">
              {{
                t(
                  "Отсутствие рекомендации может означать пробел в каталоге, ограничения аудитории или неполные данные. Эти сигналы не оценивают мотивацию сотрудника.",
                )
              }}
            </p>
            <NuxtLink to="/hr-people" class="btn section"
              >{{ t("Посмотреть сотрудников") }}<CqIcon name="people"
            /></NuxtLink>
          </section>
          <section class="panel" data-testid="hr-coverage">
            <div class="panel-head">
              <h2>{{ t("Доступность рекомендаций") }}</h2>
              <CqIcon name="chart" />
            </div>
            <CqAsync :loading="blocks.coverage.loading" :error="blocks.coverage.error" @retry="loadSection('coverage')">
            <div
              v-for="(label, status) in coverageLabels"
              :key="status"
              class="legend-row"
            >
              <span class="small">{{ t(label) }}</span
              ><strong>{{ t(coverage[status]) }}</strong>
            </div>
            </CqAsync>
          </section>
        </div>
      </div>
      <section class="panel section" data-testid="hr-attention">
        <div class="panel-head">
          <h2>{{ t("Сигналы для внимания HR") }}</h2>
          <CqTag v-if="blocks.attention.data" color="outline">{{
            t("{p0} сотрудников", { p0: attentionMeta.total })
          }}</CqTag>
        </div>
        <CqAsync :loading="blocks.attention.loading" :error="blocks.attention.error" @retry="loadSection('attention')">
        <div class="table-wrap">
          <table v-if="attention.length">
            <thead>
              <tr>
                <th>{{ t("Сотрудник") }}</th>
                <th>{{ t("Роль / грейд") }}</th>
                <th>{{ t("Наблюдаемые сигналы") }}</th>
                <th>{{ t("Участий") }}</th>
                <th>{{ t("Действие") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in attention" :key="row.employeeId">
                <td>
                  <strong>{{ t(row.employeeId) }}</strong>
                </td>
                <td>
                  {{ t(nameOf(roles, row.roleId)) }}
                  <div class="sub">{{ t(row.gradeId) }}</div>
                </td>
                <td>
                  <div
                    v-for="reason in row.reasons"
                    :key="reason"
                    class="small"
                  >
                    {{ t(reasons[reason] || reason) }}
                  </div>
                </td>
                <td>
                  {{ t(row.recordedParticipations) }}
                  <div class="sub">{{ t('Необязательных: {voluntary}; обязательных: {mandatory}.', { voluntary: row.voluntaryParticipations, mandatory: row.mandatoryParticipations }) }}</div>
                  <div class="sub">
                    {{
                      t("Пропусков: {p0}", { p0: row.skippedParticipations })
                    }} · {{ t("Прерываний:") }} {{ n(row.droppedParticipations ?? 0) }} · {{ t("Отказов:") }} {{ n(row.declinedParticipations ?? 0) }}
                  </div>
                </td>
                <td>
                  <NuxtLink
                    :to="{
                      path: '/hr-employee',
                      query: { id: row.employeeId },
                    }"
                    class="btn ghost"
                    >{{ t("Открыть") }}<CqIcon name="arrow"
                  /></NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-inline">
            {{ t("В выбранной выборке нет сигналов для внимания HR.") }}
          </div>
        </div>
        <div class="pagination">
          <span>{{
            t("Страница {p0} из {p1}", {
              p0: attentionPage,
              p1: attentionPages,
            })
          }}</span>
          <div class="actions">
            <button
              class="btn secondary"
              :disabled="attentionPage <= 1"
              @click="paginate('attention', attentionPage - 1)"
            >
              <CqIcon name="back" />{{ t("Назад") }}
            </button>
            <button
              class="btn secondary"
              :disabled="attentionPage >= attentionPages"
              @click="paginate('attention', attentionPage + 1)"
            >
              {{ t("Далее") }}<CqIcon name="arrow" />
            </button>
          </div>
        </div>
        </CqAsync>
      </section>
      <div class="section">
        <CqNotice>{{
          t(
            "Доля завершений рассчитана по всем записям участия за период, включая обязательные активности и незавершённые записи. Это описание участия, а не оценка эффективности сотрудника.",
          )
        }}</CqNotice>
      </div>
  </div>
</template>
