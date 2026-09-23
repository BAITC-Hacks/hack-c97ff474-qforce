<script setup>
import { t } from '../utils/i18n.js';
import { localeState } from "../utils/i18n.js";
import { date, formats, reasonLabel } from "../utils/labels.js";
const route = useRoute(),
  { request } = useApi();
const { store, loadEmployee, loadCatalogs, skillName } = useCareer();
const hr = computed(() => store.user?.role === 'HR');
const employeeId = computed(() => hr.value ? (typeof route.query.employee === 'string' ? route.query.employee : '') : store.user?.employeeId);
const activity = ref(null),
  loading = ref(true),
  error = ref(""),
  actionError = ref(""),
  catalogError = ref(""),
  busy = ref(false),
  sessionDate = ref("");
const id = computed(() =>
  typeof route.query.id === "string" ? route.query.id : "",
);
const participation = computed(() =>
  store.history.find(
    (row) =>
      row.activityId === id.value &&
      (activity.value?.format === "self_paced" ||
        !sessionDate.value ||
        row.date === sessionDate.value) &&
      ["registered", "in_progress", "overdue"].includes(row.status),
  ),
);
const recommendation = computed(() =>
  employeeId.value && store.profile?.id === employeeId.value && store.recommendations?.recommendations.find(
    (row) => row.activityId === id.value,
  ),
);
const eligibility = computed(() =>
  employeeId.value && store.profile?.id === employeeId.value && store.eligible?.eligible.find((row) => row.activity.id === id.value),
);
const excluded = computed(
  () =>
    store.eligible?.excluded.find((row) => row.activityId === id.value)
      ?.reasons || [],
);
const sessions = computed(() =>
  (activity.value?.upcomingSessions || []).filter(
    (value) => value >= (store.eligible?.asOfDate || ""),
  ),
);
watch(sessions, values => { if (!values.includes(sessionDate.value)) sessionDate.value = values[0] || ''; });
async function loadEventCatalog() {
  catalogError.value = '';
  try { await loadCatalogs(); } catch (cause) { catalogError.value = cause.message; }
}
let version = 0;
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = "";
  activity.value = null;
  if (!id.value) {
    error.value = "Активность не указана. Выберите её в каталоге.";
    loading.value = false;
    return;
  }
  try {
    const [result] = await Promise.all([
      request("/activities/" + encodeURIComponent(id.value), {
        query: { locale: localeState.locale },
      }),
      employeeId.value ? loadEmployee(employeeId.value, { waitForOptional: false }) : Promise.resolve(),
    ]);
    if (current !== version) return;
    activity.value = result.data;
    if (!employeeId.value) void loadEventCatalog();
    sessionDate.value =
      result.data.upcomingSessions.find(
        (value) => value >= (store.eligible?.asOfDate || ""),
      ) || "";
    if (employeeId.value && store.error) error.value = store.error;
  } catch (e) {
    if (current === version) error.value = e.message;
  } finally {
    if (current === version) loading.value = false;
  }
}
watch([id, employeeId, () => localeState.locale], load, { immediate: true });
async function enroll() {
  if (hr.value || busy.value || !store.profile) return;
  busy.value = true;
  actionError.value = "";
  try {
    await request(
      "/employees/" + encodeURIComponent(store.profile.id) + "/participations",
      {
        method: "POST",
        body: {
          activityId: id.value,
          ...(activity.value.format !== "self_paced" && sessionDate.value
            ? { sessionDate: sessionDate.value }
            : {}),
        },
      },
    );
    await loadEmployee();
    if (store.error)
      actionError.value =
        "Запись сохранена, но обновить профиль не удалось: " + store.error;
    else await navigateTo("/activities");
  } catch (e) {
    actionError.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <CqAsync :loading="loading" :error="error" @retry="load"
    ><div v-if="activity">
      <CqHeading :title="activity.title" :subtitle="activity.id"
        ><NuxtLink :to="hr ? (employeeId ? { path: '/hr-employee', query: { id: employeeId } } : '/hr-events') : '/catalog'" class="btn secondary"
          >{{ t(hr ? 'Назад' : 'К каталогу') }} <CqIcon name="back" /></NuxtLink
      ></CqHeading>
      <CqDataWarnings v-if="employeeId" />
      <div v-if="catalogError" role="alert"><CqNotice color="gold">{{ t(catalogError) }}</CqNotice><button class="btn secondary" @click="loadEventCatalog">{{ t('Повторить загрузку блока') }}</button></div>
      <div class="grid main-aside">
        <div class="stack">
          <section class="panel">
            <div class="event-cover">
              <div>
                <div class="eyebrow text-primary"> {{ t("Развивающая активность") }} </div>
                <h2 class="my-2.5"> {{ t("От обучения —") }} <br /> {{ t("к конкретному навыку") }} </h2>
                <div class="tags">
                  <CqTag color="green">{{ t(formats[activity.format]) }}</CqTag
                  ><CqTag color="outline">{{ activity.type }}</CqTag>
                </div>
              </div>
              <div class="cover-icon"><CqIcon name="layers" /></div>
            </div>
            <h2> {{ t("Об активности") }} </h2>
            <p class="small muted section">{{ activity.description }}</p>
            <div class="event-facts">
              <div>
                <small> {{ t("Трудозатраты") }} </small
                ><strong>{{ activity.durationHours }} {{ t("часов") }} </strong>
              </div>
              <div>
                <small> {{ t("Формат") }} </small
                ><strong>{{ t(formats[activity.format]) }}</strong>
              </div>
              <div>
                <small> {{ t("Начало") }} </small
                ><strong>{{
                  t(activity.format === "self_paced"
                    ? "В своём темпе"
                    : date(sessionDate))
                }}</strong>
              </div>
            </div>
            <h3> {{ t("Навыки и правила активности") }} </h3>
            <div
              v-for="effect in activity.effects"
              :key="effect.skillId"
              class="line-item"
            >
              <div>
                <strong>{{ skillName(effect.skillId) }}</strong>
                <div class="small muted"> {{ t("Прирост по правилу:") }} {{ effect.gain }} {{ t("· потолок:") }} {{ effect.maxLevel }}
                </div>
              </div>
            </div>
            <p v-if="!activity.effects.length" class="empty-inline"> {{ t("Изменение навыков для активности не задано.") }} </p>
            <div
              v-for="change in eligibility?.expectedSkillChanges || []"
              :key="change.skillId"
              class="line-item"
            >
              <span>{{ skillName(change.skillId) }}</span
              ><CqTag color="green"
                >{{ change.before }} → {{ change.after }} (+{{
                  change.actualGain
                }})</CqTag
              >
            </div>
            <CqNotice
              > {{ t("Фактическое изменение навыков сохраняется после завершения и учитывает ваш текущий уровень.") }} </CqNotice
            >
          </section>
        <section v-if="recommendation" class="panel">
          <h2> {{ t("Почему этот шаг?") }} </h2>
          <CqNotice v-if="store.recommendations?.stale" color="gold"> {{ t("Это объяснение из предыдущего подбора. Обновите рекомендации с учётом текущего профиля.") }} </CqNotice>
          <CqEvidence :rec="recommendation" />
          </section>
        </div>
        <div class="stack">
          <section v-if="!hr" class="panel">
            <h2>
              {{
                t(activity.mandatory
                  ? "Обязательное обучение"
                  : "Участие в активности")
              }}
            </h2>
            <div v-if="activity.format !== 'self_paced'" class="field">
              <label for="sessionDate"> {{ t("Дата сессии") }} </label
              ><select
                id="sessionDate"
                v-model="sessionDate"
                class="select"
                :disabled="busy"
              >
                <option value="" disabled> {{ t("Нет доступной сессии") }} </option>
                <option v-for="value in sessions" :key="value" :value="value">
                  {{ date(value) }}
                </option>
              </select>
            </div>
            <CqNotice v-if="excluded.length" color="gold"
              > {{ t("Не включена в рекомендации:") }} {{ excluded.map(reasonLabel).join(" · ") }} {{ t(". Возможность записи дополнительно проверяется при отправке.") }} </CqNotice
            >
            <CqNotice v-if="actionError" color="red" role="alert">{{
              t(actionError)
            }}</CqNotice>
            <NuxtLink
              v-if="participation"
              to="/activities"
              class="btn wide section"
              > {{ t("Открыть моё участие") }} </NuxtLink
            >
            <button
              v-else
              class="btn wide section"
              :disabled="
                busy ||
                !store.profile ||
                (activity.format !== 'self_paced' && !sessionDate)
              "
              @click="enroll"
            >
              {{ t(busy ? "Сохраняем…" : "Записаться") }} <CqIcon name="check" />
            </button>
          </section>
          <section v-if="hr" class="panel"><h2>{{ t('Просмотр активности') }}</h2><CqNotice>{{ t('HR может изучать активность. Запись, завершение и отказ доступны самому сотруднику.') }}</CqNotice></section>
          <section class="panel">
            <h3> {{ t("Входные требования") }} </h3>
            <p
              v-for="(level, skill) in activity.prerequisites"
              :key="skill"
              class="small section"
            >
              {{ skillName(skill) }}: {{ level }}
            </p>
            <p
              v-if="!Object.keys(activity.prerequisites).length"
              class="small muted section"
            > {{ t("Требования к навыкам не заданы.") }} </p>
          </section>
        </div>
      </div>
    </div></CqAsync
  >
</template>
