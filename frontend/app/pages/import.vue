<script setup>
const { store, importData } = useCareer(),
  files = shallowRef([]),
  result = ref(null),
  busy = ref(false),
  dragging = ref(false),
  input = ref(null);
function choose(list) {
  files.value = Array.from(list);
  result.value = null;
}
function drop(e) {
  dragging.value = false;
  choose(e.dataTransfer.files);
}
function clear() {
  files.value = [];
  result.value = null;
  if (input.value) input.value.value = "";
}
async function run() {
  busy.value = true;
  result.value = await importData(files.value);
  busy.value = false;
}
const datasets = computed(() => [
  ["employees.json", store.data.employees.length + " профилей"],
  ["events.json", store.data.events.length + " активностей"],
  [
    "skills.json",
    store.data.skills.length +
      " навыков / " +
      store.data.role_profiles.length +
      " матрицы",
  ],
  ["activity_history.csv", store.data.history.length + " записей"],
]);
</script>
<template>
  <div>
    <CqHeading
      title="Импорт профилей и истории"
      subtitle="Проверочные данные жюри загружаются в той же схеме, что и стартовый набор."
      ><CqTag color="green">Только локальный браузер</CqTag></CqHeading
    >
    <div class="grid main-aside">
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h2>Добавить проверочные данные</h2>
            <CqTag color="outline">JSON + CSV</CqTag>
          </div>
          <div
            class="file-drop"
            :class="{ dragging }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="drop"
          >
            <CqIcon name="upload" />
            <h3>Выберите файлы профилей и истории</h3>
            <p>
              employees.json и activity_history.csv · до 3 МБ на файл<br />Можно
              перетащить файлы сюда. ZIP предварительно распакуйте.
            </p>
            <button class="btn" type="button" @click="input.click()">
              Выбрать файлы <CqIcon name="file" /></button
            ><input
              ref="input"
              type="file"
              class="sr-only"
              aria-label="Файлы профилей и истории"
              accept=".json,.csv"
              multiple
              @change="choose($event.target.files)"
            />
          </div>
          <div v-for="(f, i) in files" :key="i" class="file-row">
            <span class="mini-icon"><CqIcon name="file" /></span>
            <div>
              <strong>{{ f.name }}</strong>
              <div class="small muted">{{ (f.size / 1024).toFixed(1) }} КБ</div>
            </div>
            <CqTag color="green">Выбран</CqTag>
          </div>
          <div class="actions section">
            <button class="btn" :disabled="busy || !files.length" @click="run">
              {{ busy ? "Проверяем…" : "Проверить и загрузить" }}
              <CqIcon name="upload" /></button
            ><button
              class="btn secondary"
              :disabled="busy || !files.length"
              @click="clear"
            >
              Очистить выбор <CqIcon name="x" />
            </button>
          </div>
          <div
            v-if="result"
            class="section"
            :role="result.ok ? 'status' : 'alert'"
          >
            <CqNotice v-if="result.ok" icon="check"
              ><strong>Загрузка завершена.</strong> Профилей:
              {{ result.profiles }}; новых записей: {{ result.added }};
              идентичных повторов пропущено: {{ result.skipped }}. Рекомендации
              и HR-сводка пересчитаны.</CqNotice
            ><template v-else
              ><CqNotice color="red"
                ><strong>Ничего не импортировано.</strong> Исправьте ошибки;
                текущие данные сохранены.</CqNotice
              >
              <ul class="import-errors">
                <li v-for="(error, i) in result.errors.slice(0, 15)" :key="i">
                  {{ error }}
                </li>
              </ul></template
            >
          </div>
        </section>
        <section class="panel">
          <h2>Загруженный стартовый набор</h2>
          <div v-for="[file, count] in datasets" :key="file" class="file-row">
            <span class="mini-icon"><CqIcon name="file" /></span>
            <div>
              <strong>{{ file }}</strong>
              <div class="small muted">{{ count }}</div>
            </div>
            <div class="tags"><CqTag color="green">Загружено</CqTag></div>
          </div>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <h2>Что проверяем</h2>
          <div
            v-for="([title, desc], i) in [
              [
                'Схема и типы',
                'Корневой объект employees, навыки 0–5, известные роли и грейды.',
              ],
              [
                'Связи и статусы',
                'employee_id, event_id, manager_id и допустимые статусы участия.',
              ],
              [
                'Даты и конфликты',
                'Нет будущих записей относительно среза; конфликт record_id отклоняется.',
              ],
              [
                'Атомарность',
                'При ошибке не применяется ни один из выбранных файлов.',
              ],
            ]"
            :key="i"
            class="timeline-step section"
          >
            <div class="num">{{ i + 1 }}</div>
            <div>
              <h3>{{ title }}</h3>
              <p>{{ desc }}</p>
            </div>
          </div>
        </section>
        <CqNotice color="gold"
          >Исходные файлы не меняются. Импорт сохраняется в localStorage. Для
          рабочей системы нужен серверный импорт с авторизацией и
          аудитом.</CqNotice
        >
        <div class="source">
          Дата набора: 2026-10-01<br />meta.as_of_date — бизнес-дата, не часы
          устройства.
        </div>
      </div>
    </div>
  </div>
</template>
