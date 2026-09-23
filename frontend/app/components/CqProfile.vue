<script setup>
import { initials, date } from "../utils/labels.js";
defineProps({ hr: Boolean });
const { store, current, skillName } = useCareer();
const sorted = computed(() =>
  current.value.p.gaps
    .slice()
    .sort((a, b) => Number(b.critical) - Number(a.critical)),
);
const manager = computed(() =>
  store.data.employees.find(
    (e) => e.employee_id === current.value.employee.manager_id,
  ),
);
</script>
<template>
  <div>
    <CqHeading
      :title="hr ? current.employee.full_name : 'Мой профиль и навыки'"
      :subtitle="
        hr
          ? 'Индивидуальная карточка для HR. Данные вовлечённости не видны коллегам.'
          : 'Оценка навыков, история и цель в одном месте.'
      "
      ><NuxtLink :to="hr ? '/hr-people' : '/path'" class="btn secondary"
        >{{ hr ? "К списку сотрудников" : "Карьерная траектория"
        }}<CqIcon :name="hr ? 'back' : 'arrow'" /></NuxtLink
    ></CqHeading>
    <div class="grid aside-main">
      <div class="stack">
        <section class="panel profile-info">
          <div class="avatar big">{{ initials(current.employee) }}</div>
          <h2>{{ current.employee.full_name }}</h2>
          <p class="role">{{ current.employee.role }}</p>
          <div class="tags">
            <CqTag color="green">{{ current.employee.grade }}</CqTag
            ><CqTag color="outline">{{ current.employee.employee_id }}</CqTag>
          </div>
          <dl class="details-list">
            <div>
              <dt>Стаж</dt>
              <dd>{{ current.employee.tenure_months }} мес.</dd>
            </div>
            <div>
              <dt>Формат работы</dt>
              <dd>
                {{
                  { office: "Офис", hybrid: "Гибрид", remote: "Удалённо" }[
                    current.employee.work_format
                  ]
                }}
              </dd>
            </div>
            <div>
              <dt>Оценка навыков</dt>
              <dd>{{ date(current.employee.last_review_date) }}</dd>
            </div>
            <div>
              <dt>Язык профиля</dt>
              <dd>{{ current.employee.preferred_language?.toUpperCase() }}</dd>
            </div>
          </dl>
          <div class="line-item">
            <div>
              <small class="muted">Подразделение</small>
              <div class="small">{{ current.employee.department }}</div>
            </div>
          </div>
          <div class="line-item">
            <div>
              <small class="muted">Руководитель</small>
              <div class="small">{{ manager?.full_name || "Не назначен" }}</div>
            </div>
          </div>
        </section>
        <CqNotice color="gold"
          >Уровни после оценки дополнены завершениями из истории. Для
          самостоятельных курсов дата участия используется как
          приближение.</CqNotice
        >
        <section class="panel">
          <div class="section-kicker">Источник прогресса</div>
          <div class="big-progress">{{ current.p.actual.applied.length }}</div>
          <p class="small muted section">
            завершений после оценки учтено по дате записи
          </p>
          <div class="source section">
            employees.json + activity_history.csv + events.json
          </div>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h2>Навыки для цели: {{ current.p.goal.target_grade }}</h2>
            <CqTag :color="current.p.goal.inferred ? 'gold' : 'green'">{{
              current.p.goal.inferred
                ? "Цель предложена системой"
                : "Цель сотрудника"
            }}</CqTag>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Навык</th>
                  <th>Сейчас / нужно</th>
                  <th>Разрыв</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in sorted" :key="g.id">
                  <td>
                    <strong>{{ skillName(g.id) }}</strong>
                    <div v-if="g.critical" class="sub">
                      Критический для целевого грейда
                    </div>
                  </td>
                  <td>
                    <strong>{{ g.current }}</strong> / {{ g.required }}
                    <div class="bar mt-2 max-w-40">
                      <span
                        :style="{
                          width:
                            Math.min(100, (g.current / g.required) * 100) + '%',
                        }"
                      />
                    </div>
                  </td>
                  <td>
                    <CqTag
                      :color="
                        g.gap ? (g.critical ? 'gold' : 'outline') : 'green'
                      "
                      >{{ g.gap ? "−" + g.gap + " ур." : "Закрыто" }}</CqTag
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>История участия</h2>
            <NuxtLink to="/activities" class="inline-link"
              >{{ current.history.length }} записей <CqIcon name="arrow"
            /></NuxtLink>
          </div>
          <CqRecent :history="current.history" />
        </section>
      </div>
    </div>
  </div>
</template>
