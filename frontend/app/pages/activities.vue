<script setup>
import { eventTitle, date, statuses } from "../utils/labels.js";
const { store, employee, current } = useCareer(),
  status = ref("all");
const rows = computed(() =>
  current.value.history
    .filter((r) => status.value === "all" || r.status === status.value)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({
      ...r,
      event: store.data.events.find((e) => e.event_id === r.event_id),
    })),
);
const planned = computed(() =>
  store.state.plan
    .filter((k) => k.startsWith(employee.value.employee_id + ":"))
    .map((k) => store.data.events.find((e) => e.event_id === k.split(":")[1]))
    .filter(Boolean),
);
</script>
<template>
  <div>
    <CqHeading
      title="Мои активности"
      subtitle="История развития и обязательные назначения — раздельно по смыслу."
      ><NuxtLink to="/catalog" class="btn secondary"
        >Найти следующий шаг <CqIcon name="book" /></NuxtLink
    ></CqHeading>
    <div class="grid four">
      <CqMetric
        label="Завершено"
        :value="current.history.filter((r) => r.status === 'completed').length"
        caption="Все записи участия"
        icon="check"
      /><CqMetric
        label="В процессе"
        :value="
          current.history.filter((r) => r.status === 'in_progress').length
        "
        caption="Можно продолжить"
        icon="clock"
      /><CqMetric
        label="В личном плане"
        :value="planned.length"
        caption="Добавлено в демо"
        icon="calendar"
      /><CqMetric
        label="Всего записей"
        :value="current.history.length"
        caption="История из датасета"
        icon="file"
      />
    </div>
    <section v-if="planned.length" class="panel section">
      <div class="panel-head">
        <h2>Мой план</h2>
        <CqTag color="green">{{ planned.length }} активностей</CqTag>
      </div>
      <div v-for="event in planned" :key="event.event_id" class="line-item">
        <strong>{{ eventTitle(event) }}</strong
        ><NuxtLink
          :to="{ path: '/event', query: { id: event.event_id } }"
          class="btn ghost"
          >Продолжить <CqIcon name="arrow"
        /></NuxtLink>
      </div>
    </section>
    <div class="filters" aria-label="Фильтр статуса">
      <button
        class="filter-btn"
        :class="{ active: status === 'all' }"
        :aria-pressed="status === 'all'"
        @click="status = 'all'"
      >
        Все</button
      ><button
        v-for="(s, key) in statuses"
        :key="key"
        class="filter-btn"
        :class="{ active: status === key }"
        :aria-pressed="status === key"
        @click="status = key"
      >
        {{ s[0] }}
      </button>
    </div>
    <section class="panel">
      <div class="panel-head">
        <h2>История участия</h2>
        <CqTag color="outline">{{ rows.length }} записей</CqTag>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Активность</th>
              <th>Дата записи</th>
              <th>Статус</th>
              <th>Прохождение</th>
              <th>Инициатор</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.record_id">
              <td>
                <NuxtLink :to="{ path: '/event', query: { id: r.event_id } }"
                  ><strong>{{ eventTitle(r.event) }}</strong></NuxtLink
                >
                <div class="sub">
                  {{
                    r.event.mandatory
                      ? "Обязательное назначение"
                      : "Развивающая активность"
                  }}
                  · {{ r.event_id }}
                </div>
              </td>
              <td>
                {{ date(r.date) }}
                <div v-if="r.completed_at" class="sub">
                  Завершено {{ date(r.completed_at) }}
                </div>
                <div v-else-if="r.event.format === 'self_paced'" class="sub">
                  Дата зачисления, не завершения
                </div>
              </td>
              <td>
                <CqTag :color="statuses[r.status][1]">{{
                  statuses[r.status][0]
                }}</CqTag>
              </td>
              <td>
                {{ r.completion_pct }}%
                <div class="bar mt-1.5 max-w-24">
                  <span :style="{ width: Number(r.completion_pct) + '%' }" />
                </div>
              </td>
              <td>
                {{
                  { self: "Самостоятельно", manager: "Руководитель", hr: "HR" }[
                    r.assigned_by
                  ]
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!rows.length" class="empty-inline">
          Нет записей для выбранного статуса.
        </div>
      </div>
    </section>
    <div class="section">
      <CqNotice color="gold"
        >Процент прохождения курса — не уровень навыка. Навык меняется только
        при completed. У добровольных активностей нет due_date: оценить «в срок»
        нельзя.</CqNotice
      >
    </div>
  </div>
</template>
