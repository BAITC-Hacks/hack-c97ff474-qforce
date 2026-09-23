<script setup>
import { t } from '../utils/i18n.js';
const { request } = useApi();
const route = useRoute(),
  router = useRouter();
const files = shallowRef([]),
  result = ref(null),
  busy = ref(false),
  loading = ref(false);
const dragging = ref(false),
  input = ref(null),
  error = ref(""),
  reportWarning = ref("");
const validated = ref(false);
const fieldNames = {
  "skills.json": "skills",
  "employees.json": "employees",
  "events.json": "events",
  "activity_history.csv": "history",
  "dataset-rules.json": "rules",
};
const canApply = computed(
  () =>
    validated.value && files.value.length > 0 && !busy.value && !loading.value,
);
const runLabels = {
  VALIDATED: "Проверка пройдена",
  APPLIED: "Импорт применён",
  REJECTED: "Пакет отклонён",
  RUNNING: "Обработка",
};
function choose(list) {
  if (busy.value || loading.value) return;
  files.value = Array.from(list || []);
  result.value = null;
  error.value = "";
  reportWarning.value = "";
  validated.value = false;
  const names = new Set();
  for (const file of files.value) {
    if (!Object.hasOwn(fieldNames, file.name)) {
      error.value =
        "Неизвестный файл: " +
        file.name +
        ". Используйте названия из списка справа.";
      break;
    }
    if (file.size > 8 * 1024 * 1024) {
      error.value = "Файл " + file.name + " превышает ограничение 8 МиБ.";
      break;
    }
    if (names.has(file.name)) {
      error.value = "Повторное имя файла: " + file.name;
      break;
    }
    names.add(file.name);
  }
  router.replace({ query: {} });
}
function drop(event) {
  dragging.value = false;
  choose(event.dataTransfer.files);
}
function clear() {
  choose([]);
  if (input.value) input.value.value = "";
}
function body() {
  const form = new FormData();
  for (const file of files.value)
    form.append(fieldNames[file.name], file, file.name);
  return form;
}
async function readRun(id) {
  const response = await request("/imports/" + encodeURIComponent(id));
  result.value = response.data;
}
async function run(apply = false) {
  if (
    busy.value ||
    loading.value ||
    !files.value.length ||
    (apply && !canApply.value)
  )
    return;
  busy.value = true;
  error.value = "";
  reportWarning.value = "";
  validated.value = false;
  try {
    const response = await request(apply ? "/imports" : "/imports/dry-run", {
      method: "POST",
      body: body(),
    });
    result.value = response.data;
    validated.value =
      !apply &&
      result.value.status === "VALIDATED" &&
      result.value.report.valid;
    await router.replace({ query: { run: response.data.id } });
    try {
      await readRun(response.data.id);
    } catch (cause) {
      reportWarning.value =
        "Операция завершена, но повторно получить сохранённый отчёт не удалось: " +
        cause.message;
    }
  } catch (cause) {
    error.value = cause.message || "Не удалось выполнить импорт.";
    if (cause.details?.report && cause.details?.id) {
      result.value = cause.details;
      await router.replace({ query: { run: cause.details.id } });
    } else if (apply) {
      result.value = null;
    }
  } finally {
    busy.value = false;
  }
}
async function loadSaved() {
  const id = typeof route.query.run === "string" ? route.query.run : "";
  if (!id) return;
  loading.value = true;
  error.value = "";
  try {
    await readRun(id);
  } catch (cause) {
    error.value = cause.message || "Не удалось загрузить отчёт импорта.";
  } finally {
    loading.value = false;
  }
}
onMounted(loadSaved);
</script>
<template>
  <div>
    <CqHeading
      :title="t('Импорт профилей и истории')"
      :subtitle="t('Проверьте пакет данных, затем примените его к общему набору.')"
    >
      <CqTag color="green"> {{ t("Сохранение на сервере") }} </CqTag>
    </CqHeading>
    <div class="grid main-aside">
      <div class="stack">
        <section class="panel" :aria-busy="busy || loading">
          <div class="panel-head">
            <h2> {{ t("Добавить данные") }} </h2>
            <CqTag color="outline">JSON + CSV</CqTag>
          </div>
          <div
            class="file-drop"
            :class="{ dragging: dragging && !busy && !loading }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="drop"
          >
            <CqIcon name="upload" />
            <h3> {{ t("Выберите файлы профилей, каталога и истории") }} </h3>
            <p> {{ t("До 5 файлов, до 8 МиБ каждый. Можно загрузить полный пакет или отдельные файлы. ZIP предварительно распакуйте.") }} </p>
            <button
              class="btn"
              type="button"
              :disabled="busy || loading"
              @click="input.click()"
            > {{ t("Выбрать файлы") }} <CqIcon name="file" />
            </button>
            <input
              ref="input"
              type="file"
              class="sr-only"
              :aria-label="t('Файлы для импорта')"
              accept=".json,.csv"
              multiple
              :disabled="busy || loading"
              @change="choose($event.target.files)"
            />
          </div>
          <div v-for="(file, index) in files" :key="index" class="file-row">
            <span class="mini-icon"><CqIcon name="file" /></span>
            <div>
              <strong>{{ file.name }}</strong>
              <div class="small muted">
                {{ (file.size / 1024).toFixed(1) }} {{ t("КиБ") }} </div>
            </div>
            <CqTag color="outline"> {{ t("Выбран") }} </CqTag>
          </div>
          <div class="actions section">
            <button
              class="btn secondary"
              :disabled="busy || loading || !files.length || !!error"
              @click="run(false)"
            >
              {{ t(busy ? "Обрабатываем…" : "1. Проверить пакет") }}
              <CqIcon name="check" />
            </button>
            <button class="btn" :disabled="!canApply" @click="run(true)"> {{ t("2. Применить импорт") }} <CqIcon name="upload" />
            </button>
            <button
              class="btn ghost"
              :disabled="busy || loading || !files.length"
              @click="clear"
            > {{ t("Очистить") }} <CqIcon name="x" />
            </button>
          </div>
          <p class="small muted section"> {{ t("Проверка не изменяет профили и историю. Применение доступно после успешной проверки выбранных файлов.") }} </p>
          <div v-if="loading" class="empty-inline" role="status"> {{ t("Получаем сохранённый отчёт…") }} </div>
          <div v-if="error" class="section" role="alert">
            <CqNotice color="red">{{ t(error) }}</CqNotice>
            <button
              v-if="!files.length && route.query.run"
              class="btn secondary section"
              :disabled="loading"
              @click="loadSaved"
            > {{ t("Повторить загрузку отчёта") }} </button>
            <button
              v-else-if="files.length && !busy"
              class="btn secondary section"
              @click="choose(files)"
            > {{ t("Проверить выбор файлов заново") }} </button>
          </div>
          <CqNotice v-if="reportWarning" color="gold" class="section">{{
            t(reportWarning)
          }}</CqNotice>
        </section>
        <section
          v-if="result"
          class="panel"
          :role="result.status === 'REJECTED' ? 'alert' : 'status'"
        >
          <div class="panel-head">
            <h2>{{ t(runLabels[result.status] || result.status) }}</h2>
            <CqTag
              :color="
                result.status === 'APPLIED' || result.status === 'VALIDATED'
                  ? 'green'
                  : 'gold'
              "
              >{{ result.status }}</CqTag
            >
          </div>
          <p v-if="result.status === 'APPLIED'"> {{ t("Данные сохранены. Профили, каталог и HR-сводки используют обновлённый набор.") }} </p>
          <p v-else-if="result.status === 'VALIDATED'"> {{ t("Пакет прошёл проверку. Бизнес-данные ещё не изменены.") }} </p>
          <p v-else-if="result.status === 'REJECTED'"> {{ t("Ничего не импортировано. Исправьте указанные ошибки и выберите файлы заново.") }} </p>
          <div class="grid four section">
            <CqMetric
              :label="t('Создание')"
              :value="result.report.counts.create"
              :caption="t('Записей')"
              icon="file"
            />
            <CqMetric
              :label="t('Обновление')"
              :value="result.report.counts.update"
              :caption="t('Записей')"
              icon="refresh"
            />
            <CqMetric
              :label="t('Пропущено')"
              :value="result.report.counts.skip"
              :caption="t('Повторные записи')"
              icon="check"
            />
            <CqMetric
              :label="t('Конфликты')"
              :value="result.report.counts.conflict"
              :caption="t('Требуют исправления')"
              icon="file"
            />
          </div>
          <p class="small muted section"> {{ t("ID отчёта:") }} {{ result.id }} {{ t("· Дата среза:") }} {{ result.report.rules.asOfDate }}
          </p>
          <div
            v-for="(count, filename) in result.report.records"
            :key="filename"
            class="legend-row"
          >
            <span>{{ filename }}</span
            ><strong>{{ count }}</strong>
          </div>
          <div
            v-if="result.report.diagnostics.length"
            class="table-wrap section"
          >
            <table>
              <thead>
                <tr>
                  <th> {{ t("Файл / строка") }} </th>
                  <th> {{ t("Поле / код") }} </th>
                  <th> {{ t("Описание") }} </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(diagnostic, index) in result.report.diagnostics"
                  :key="index"
                >
                  <td>
                    {{ diagnostic.file }}
                    <div class="sub">
                      {{
                        t(diagnostic.row != null
                          ? "Строка " + diagnostic.row
                          : diagnostic.recordId || "")
                      }}
                    </div>
                  </td>
                  <td>
                    {{ diagnostic.field }}
                    <div class="sub">{{ diagnostic.code }}</div>
                  </td>
                  <td>{{ diagnostic.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="result.status === 'APPLIED'" class="actions section">
            <NuxtLink to="/hr-people" class="btn"
              > {{ t("Открыть сотрудников") }} <CqIcon name="people" /></NuxtLink
            ><NuxtLink to="/hr-dashboard" class="btn secondary"
              > {{ t("Обновлённая сводка") }} <CqIcon name="chart"
            /></NuxtLink>
          </div>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <h2> {{ t("Поддерживаемые файлы") }} </h2>
          <div
            v-for="[filename, description] in [
              ['skills.json', 'Каталог навыков, ролей, грейдов и требований'],
              ['employees.json', 'Профили сотрудников и уровни навыков'],
              ['events.json', 'Каталог развивающих активностей'],
              ['activity_history.csv', 'История участия'],
              ['dataset-rules.json', 'Дата среза и правила набора'],
            ]"
            :key="filename"
            class="file-row"
          >
            <span class="mini-icon"><CqIcon name="file" /></span>
            <div>
              <strong>{{ filename }}</strong>
              <div class="small muted">{{ t(description) }}</div>
            </div>
          </div>
        </section>
        <section class="panel">
          <h2> {{ t("Что проверяем") }} </h2>
          <div
            v-for="([title, description], index) in [
              [
                'Схема и типы',
                'Структура файлов, уровни навыков, допустимые роли и грейды.',
              ],
              [
                'Связи и статусы',
                'Ссылки на сотрудников, руководителей и активности.',
              ],
              [
                'Даты и конфликты',
                'Соответствие дате среза, повторные записи и конфликты идентификаторов.',
              ],
              [
                'Атомарность',
                'При отклонении пакета бизнес-данные не меняются.',
              ],
            ]"
            :key="title"
            class="timeline-step section"
          >
            <div class="num">{{ index + 1 }}</div>
            <div>
              <h3>{{ t(title) }}</h3>
              <p>{{ t(description) }}</p>
            </div>
          </div>
        </section>
        <CqNotice color="gold"
          > {{ t("Импорт доступен HR. Отчёт сохраняется на сервере; ссылку на текущую страницу можно открыть повторно после обновления браузера.") }} </CqNotice
        >
      </div>
    </div>
  </div>
</template>
