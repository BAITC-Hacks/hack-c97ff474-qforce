<script setup>
import { statuses } from "../utils/labels.js";
const { aggregate, skillName } = useCareer(),
  department = ref("all"),
  summary = computed(() => aggregate(department.value));
const completed = computed(
  () => summary.value.history.filter((r) => r.status === "completed").length,
);
</script>
<template>
  <div>
    <CqHeading
      title="Команда растёт. Вы видите — как."
      subtitle="Разрывы по компетенциям, доступность развития и участие — без рейтингов людей."
      ><CqDepartment v-model="department"
    /></CqHeading>
    <div class="grid four">
      <CqMetric
        label="Сотрудников"
        :value="summary.people.length"
        caption="В выбранном подразделении"
        icon="people"
      /><CqMetric
        label="Нет доступного шага"
        :value="summary.noStep.length"
        caption="По правилам демо-подбора"
        icon="path"
      /><CqMetric
        label="Цель не подтверждена"
        :value="summary.noGoal.length"
        caption="Предложена траектория по умолчанию"
        icon="target"
      /><CqMetric
        label="Завершение участия"
        :value="
          summary.history.length
            ? Math.round((completed / summary.history.length) * 100) + '%'
            : '—'
        "
        :caption="`${completed} из ${summary.history.length} добровольных записей`"
        icon="check"
      />
    </div>
    <div class="grid main-aside section">
      <section class="panel">
        <div class="panel-head">
          <h2>Где чаще не хватает навыка</h2>
          <CqTag color="outline">Целевые требования</CqTag>
        </div>
        <div
          v-for="s in summary.skills.slice(0, 7)"
          :key="s.id"
          class="chart-row"
        >
          <div>{{ skillName(s.id) }}</div>
          <div class="bar">
            <span :style="{ width: (100 * s.missing) / s.n + '%' }" />
          </div>
          <strong>{{ s.missing }} / {{ s.n }}</strong>
        </div>
        <p class="small muted section">
          Знаменатель — сотрудники, которым этот навык нужен для выбранной цели.
          Это не сравнение сотрудников между собой.
        </p>
      </section>
      <div class="stack">
        <section class="panel bg-[#EDF5E8]">
          <div class="section-kicker">Внимание HR</div>
          <h2>У развития бывают препятствия</h2>
          <p class="small muted section">
            Отсутствие рекомендации может означать пробел в каталоге,
            ограничения аудитории или уже закрытые требования — не отсутствие
            мотивации.
          </p>
          <div class="section">
            <NuxtLink to="/hr-people" class="btn"
              >Посмотреть сотрудников <CqIcon name="people"
            /></NuxtLink>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>Участие по статусам</h2>
            <CqIcon name="chart" />
          </div>
          <div v-for="(s, id) in statuses" :key="id" class="legend-row">
            <CqTag :color="s[1]">{{ s[0] }}</CqTag
            ><strong>{{
              summary.history.filter((r) => r.status === id).length
            }}</strong>
          </div>
        </section>
      </div>
    </div>
    <section class="panel section">
      <div class="panel-head">
        <h2>Сотрудники без доступного шага</h2>
        <NuxtLink to="/hr-people" class="btn ghost"
          >Весь список <CqIcon name="arrow"
        /></NuxtLink>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Роль / грейд</th>
              <th>Контекст</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ e } in summary.noStep.slice(0, 5)"
              :key="e.employee_id"
            >
              <td>
                <strong>{{ e.full_name }}</strong>
                <div class="sub">{{ e.employee_id }}</div>
              </td>
              <td>
                {{ e.role }}
                <div class="sub">{{ e.grade }}</div>
              </td>
              <td>
                <CqTag color="gold">{{
                  e.career_goal && e.career_goal.target_role !== e.role
                    ? "Переход в другую роль"
                    : "Проверить ограничения"
                }}</CqTag>
              </td>
              <td>
                <NuxtLink
                  :to="{ path: '/hr-employee', query: { id: e.employee_id } }"
                  class="btn ghost"
                  >Открыть <CqIcon name="arrow"
                /></NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!summary.noStep.length" class="empty-inline">
          Для всех сотрудников выборки найдены следующие шаги.
        </div>
      </div>
    </section>
  </div>
</template>
