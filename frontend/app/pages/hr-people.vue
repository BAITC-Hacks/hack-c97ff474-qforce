<script setup>
import { t } from '../utils/i18n.js';
import { localeState } from "../utils/i18n.js";
const { request } = useApi();
const department = ref(""),
  roleId = ref(""),
  gradeId = ref("");
const rows = ref([]),
  roles = ref([]),
  page = ref(1),
  total = ref(0);
const loading = ref(false),
  error = ref(""),
  catalogError = ref("");
const filters = ref({}),
  pageSize = 20;
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
let generation = 0;
const roleName = (id) => roles.value.find((role) => role.id === id)?.name || id;
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const response = await request("/employees", {
      query: { ...filters.value, page: page.value, pageSize },
    });
    if (current !== generation) return;
    rows.value = response.data;
    total.value = response.meta.total;
  } catch (cause) {
    if (current === generation)
      error.value = cause.message || "Не удалось загрузить сотрудников.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
function applyFilters() {
  filters.value = {
    department: department.value.trim() || undefined,
    roleId: roleId.value || undefined,
    gradeId: gradeId.value.trim() || undefined,
  };
  page.value = 1;
  load();
}
function turnPage(value) {
  page.value = value;
  load();
}
let catalogGeneration = 0;
async function initialize() {
  const version = ++catalogGeneration;
  catalogError.value = "";
  const results = await Promise.allSettled([
    load(),
    request("/roles", { query: { locale: localeState.locale } }),
  ]);
  if (version !== catalogGeneration) return;
  if (results[1].status === "fulfilled") roles.value = results[1].value.data;
  else
    catalogError.value =
      "Справочник ролей недоступен. Подразделение и грейд можно фильтровать отдельно.";
}
onMounted(initialize);
watch(() => localeState.locale, initialize);
</script>
<template>
  <div>
    <CqHeading
      :title="t('Сотрудники')"
      :subtitle="t('Рабочий список HR. Без публичного ранжирования по результативности.')"
    >
      <NuxtLink to="/import" class="btn secondary"
        > {{ t("Импортировать профили") }} <CqIcon name="upload"
      /></NuxtLink>
    </CqHeading>
    <form class="filters" @submit.prevent="applyFilters">
      <CqDepartment v-model="department" :disabled="loading" />
      <select
        v-model="roleId"
        class="select"
        :aria-label="t('Роль')"
        :disabled="loading"
      >
        <option value=""> {{ t("Все роли") }} </option>
        <option v-for="role in roles" :key="role.id" :value="role.id">
          {{ role.name }}
        </option>
      </select>
      <input
        v-model="gradeId"
        class="input"
        :placeholder="t('Грейд: точный ID')"
        :aria-label="t('Грейд: точный ID')"
        :disabled="loading"
      />
      <button type="submit" class="btn secondary" :disabled="loading"> {{ t("Применить") }} <CqIcon name="search" />
      </button>
    </form>
    <p class="small muted section"> {{ t("Фильтры используют точное совпадение. Поиск по имени пока недоступен.") }} </p>
    <CqNotice v-if="catalogError" color="gold">{{ t(catalogError) }}</CqNotice>
    <section class="panel section" :aria-busy="loading">
      <div class="panel-head">
        <h2> {{ t("Профили развития") }} </h2>
        <CqTag v-if="!loading && !error" color="outline"
          >{{ total }} {{ t("сотрудников") }} </CqTag
        >
      </div>
      <div v-if="loading" class="empty-inline" role="status"> {{ t("Загружаем сотрудников…") }} </div>
      <div v-else-if="error" role="alert">
        <CqNotice color="red">{{ t(error) }}</CqNotice>
        <button class="btn secondary section" @click="load"> {{ t("Повторить") }} <CqIcon name="refresh" />
        </button>
      </div>
      <template v-else>
        <div class="table-wrap">
          <table v-if="rows.length">
            <thead>
              <tr>
                <th> {{ t("Сотрудник") }} </th>
                <th> {{ t("Подразделение") }} </th>
                <th> {{ t("Роль / грейд") }} </th>
                <th> {{ t("Карьерная цель") }} </th>
                <th> {{ t("Профиль") }} </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="employee in rows" :key="employee.id">
                <td>
                  <NuxtLink
                    :to="{ path: '/hr-employee', query: { id: employee.id } }"
                    class="row-name"
                  >
                    <span class="avatar">{{
                      initials(employee.fullName)
                    }}</span>
                    <div>
                      <strong class="text-primary">{{
                        employee.fullName
                      }}</strong>
                      <div class="sub">{{ employee.id }}</div>
                    </div>
                  </NuxtLink>
                </td>
                <td>{{ employee.department }}</td>
                <td>
                  {{ roleName(employee.roleId) }}
                  <div class="sub">{{ employee.gradeId }}</div>
                </td>
                <td v-if="employee.careerGoal">
                  {{ roleName(employee.careerGoal.target_role) }}
                  <div class="sub">{{ employee.careerGoal.target_grade }}</div>
                </td>
                <td v-else><span class="muted"> {{ t("Не указана") }} </span></td>
                <td>
                  <NuxtLink
                    :to="{ path: '/hr-employee', query: { id: employee.id } }"
                    class="btn ghost"
                    > {{ t("Открыть") }} <CqIcon name="arrow"
                  /></NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-inline"> {{ t("Сотрудники не найдены. Измените фильтры.") }} </div>
        </div>
        <div class="pagination">
          <span> {{ t("Страница") }} {{ page }} {{ t("из") }} {{ pages }} {{ t("· порядок по ID") }} </span>
          <div class="actions">
            <button
              class="btn secondary"
              :disabled="page <= 1"
              @click="turnPage(page - 1)"
            >
              <CqIcon name="back" /> {{ t("Назад") }} </button>
            <button
              class="btn secondary"
              :disabled="page >= pages"
              @click="turnPage(page + 1)"
            > {{ t("Далее") }} <CqIcon name="arrow" />
            </button>
          </div>
        </div>
      </template>
    </section>
    <div class="section">
      <CqNotice color="gold"
        > {{ t("Покрытие навыков и следующий шаг доступны в профиле сотрудника. Проценты для разных целей не образуют общий рейтинг эффективности.") }} </CqNotice
      >
    </div>
  </div>
</template>
