<script setup>
import { eventTitle, formats, date } from "../utils/labels.js";
const { store, aggregate } = useCareer(),
  department = ref("all"),
  summary = computed(() => aggregate(department.value));
const rows = computed(() =>
  store.data.events
    .filter((v) => !v.mandatory)
    .map((v) => {
      const h = summary.value.history.filter((r) => r.event_id === v.event_id);
      return {
        v,
        h,
        completed: h.filter((r) => r.status === "completed").length,
        noShow: h.filter((r) => r.status === "no_show").length,
      };
    })
    .sort((a, b) => b.h.length - a.h.length),
);
</script>
<template>
  <div>
    <CqHeading
      title="Участие в развивающих активностях"
      subtitle="Анализируйте форматы и доступность, а не наказывайте за отказ от добровольного участия."
      ><CqDepartment v-model="department"
    /></CqHeading>
    <div class="grid three">
      <CqMetric
        label="Добровольных активностей"
        :value="rows.length"
        caption="Обязательные назначения исключены"
        icon="book"
      /><CqMetric
        label="Записей участия"
        :value="summary.history.length"
        :caption="'История до ' + date(store.state.asOf)"
        icon="calendar"
      /><CqMetric
        label="Неявок"
        :value="summary.history.filter((r) => r.status === 'no_show').length"
        caption="Только события по расписанию"
        icon="clock"
      />
    </div>
    <section class="panel section">
      <div class="panel-head">
        <h2>Сводка по мероприятиям</h2>
        <CqTag color="outline">Записи, не уникальные участники</CqTag>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Активность</th>
              <th>Формат</th>
              <th>Участий</th>
              <th>Завершено</th>
              <th>Неявки</th>
              <th>Завершение</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ v, h, completed, noShow } in rows" :key="v.event_id">
              <td>
                <strong>{{ eventTitle(v) }}</strong>
                <div class="sub">{{ v.event_id }}</div>
              </td>
              <td>{{ formats[v.format] }}</td>
              <td>{{ h.length }}</td>
              <td>{{ completed }}</td>
              <td>{{ v.format === "self_paced" ? "—" : noShow }}</td>
              <td>
                {{
                  h.length
                    ? Math.round((100 * completed) / h.length) + "%"
                    : "—"
                }}
                <div class="bar mt-1.5 max-w-24">
                  <span
                    :style="{
                      width:
                        (h.length ? (100 * completed) / h.length : 0) + '%',
                    }"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <div class="section">
      <CqNotice
        >Доля завершений = completed / все записи добровольного участия в
        выбранной выборке. Текущие in_progress входят в знаменатель. Это
        описательная метрика, не оценка качества или ROI программы.</CqNotice
      >
    </div>
  </div>
</template>
