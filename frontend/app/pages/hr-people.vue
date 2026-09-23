<script setup>
import { initials } from "../utils/labels.js";
const { aggregate } = useCareer(),
  department = ref("all"),
  query = ref(""),
  page = ref(1);
const summary = computed(() => aggregate(department.value));
const filtered = computed(() =>
  summary.value.rows.filter(({ e }) =>
    `${e.full_name} ${e.employee_id} ${e.role}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const pages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / 10)),
);
const shown = computed(() =>
  filtered.value.slice((page.value - 1) * 10, page.value * 10),
);
watch([query, department], () => (page.value = 1));
</script>
<template>
  <div>
    <CqHeading
      title="Сотрудники"
      subtitle="Рабочий список HR. Без публичного ранжирования по результативности."
      ><NuxtLink to="/import" class="btn secondary"
        >Импортировать профили <CqIcon name="upload" /></NuxtLink
    ></CqHeading>
    <form class="filters" @submit.prevent="page = 1">
      <input
        v-model="query"
        class="input grow"
        placeholder="Имя, ID или роль"
        aria-label="Поиск сотрудника"
      /><CqDepartment v-model="department" /><button
        type="submit"
        class="btn secondary"
      >
        Найти <CqIcon name="search" />
      </button>
    </form>
    <section class="panel">
      <div class="panel-head">
        <h2>Профили развития</h2>
        <CqTag color="outline">{{ filtered.length }} сотрудников</CqTag>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Роль / грейд</th>
              <th>Цель</th>
              <th>Покрытие навыков</th>
              <th>Следующий шаг</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ e, c } in shown" :key="e.employee_id">
              <td>
                <NuxtLink
                  :to="{ path: '/hr-employee', query: { id: e.employee_id } }"
                  class="row-name"
                  ><span class="avatar">{{ initials(e) }}</span>
                  <div>
                    <strong class="text-primary">{{ e.full_name }}</strong>
                    <div class="sub">{{ e.employee_id }}</div>
                  </div></NuxtLink
                >
              </td>
              <td>
                {{ e.role }}
                <div class="sub">{{ e.grade }}</div>
              </td>
              <td>
                {{ c.p.goal.target_role }}
                <div class="sub">
                  {{ c.p.goal.target_grade
                  }}{{ c.p.goal.inferred ? " · предложено" : "" }}
                </div>
              </td>
              <td>
                {{ c.p.progress }}%
                <div class="bar mt-1.5 max-w-24">
                  <span :style="{ width: c.p.progress + '%' }" />
                </div>
              </td>
              <td>
                <CqTag :color="c.recs.length ? 'green' : 'gold'">{{
                  c.recs.length ? c.recs.length + " шага" : "Нет доступного"
                }}</CqTag>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!shown.length" class="empty-inline">
          Сотрудники не найдены. Измените поиск или подразделение.
        </div>
      </div>
      <div class="pagination">
        <span>Страница {{ page }} из {{ pages }} · порядок по исходным ID</span>
        <div class="actions">
          <button class="btn secondary" :disabled="page <= 1" @click="page--">
            <CqIcon name="back" /> Назад</button
          ><button
            class="btn secondary"
            :disabled="page >= pages"
            @click="page++"
          >
            Далее <CqIcon name="arrow" />
          </button>
        </div>
      </div>
    </section>
    <div class="section">
      <CqNotice color="gold"
        >Проценты относятся к разным ролям и целям. Их нельзя интерпретировать
        как общий рейтинг эффективности.</CqNotice
      >
    </div>
  </div>
</template>
