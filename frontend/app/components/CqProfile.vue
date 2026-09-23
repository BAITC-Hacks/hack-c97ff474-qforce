<script setup>
import { date, initials, percent } from "../utils/labels.js";
const props = defineProps({ hr: Boolean, employeeId: String });
const { store, loadEmployee, roleName, gradeName } = useCareer();
watch(
  () => props.employeeId || store.user?.employeeId,
  (id) => {
    if (id) loadEmployee(id);
  },
  { immediate: true },
);
</script>
<template>
  <CqAsync
    :loading="store.loading"
    :error="store.error"
    :empty="!store.profile"
    @retry="loadEmployee(employeeId || store.user?.employeeId)"
  >
    <div v-if="store.profile">
      <CqHeading
        :title="hr ? store.profile.fullName : 'Мой профиль и навыки'"
        subtitle="Актуальные навыки, карьерная цель и история развития."
        ><NuxtLink :to="hr ? '/hr-people' : '/path'" class="btn secondary"
          >{{ hr ? "К списку сотрудников" : "Карьерная траектория" }}
          <CqIcon name="arrow" /></NuxtLink
      ></CqHeading>
      <div class="grid aside-main">
        <div class="stack">
          <section class="panel profile-info">
            <div class="avatar big">{{ initials(store.profile) }}</div>
            <h2>{{ store.profile.fullName }}</h2>
            <p class="role">{{ roleName(store.profile.roleId) }}</p>
            <div class="tags">
              <CqTag color="green">{{ gradeName(store.profile.gradeId) }}</CqTag
              ><CqTag color="outline">{{ store.profile.id }}</CqTag>
            </div>
            <dl class="details-list">
              <div>
                <dt>Стаж</dt>
                <dd>{{ store.profile.tenureMonths }} мес.</dd>
              </div>
              <div>
                <dt>Формат работы</dt>
                <dd>
                  {{
                    { office: "Офис", hybrid: "Гибрид", remote: "Удалённо" }[
                      store.profile.workFormat
                    ] || store.profile.workFormat
                  }}
                </dd>
              </div>
              <div>
                <dt>Оценка навыков</dt>
                <dd>{{ date(store.profile.lastReviewDate) }}</dd>
              </div>
              <div>
                <dt>Подразделение</dt>
                <dd>{{ store.profile.department }}</dd>
              </div>
              <div>
                <dt>Руководитель (ID)</dt>
                <dd>{{ store.profile.managerId || "Не назначен" }}</dd>
              </div>
            </dl>
          </section>
          <CqNotice
            >Уровни навыков учитывают сохранённые завершения. Автоматического
            повышения грейда нет.</CqNotice
          >
          <section class="panel">
            <div class="section-kicker">Соответствие следующему грейду</div>
            <div class="big-progress">
              {{ percent(store.trajectory.readinessPercent) }}
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="panel">
            <div class="panel-head">
              <h2>
                Навыки для грейда {{ gradeName(store.trajectory.nextGradeId) }}
              </h2>
            </div>
            <CqSkill
              v-for="gap in store.trajectory.gaps"
              :key="gap.skillId"
              :gap="gap"
            />
            <p v-if="!store.trajectory.gaps.length" class="empty-inline">
              Требования для следующего грейда не заданы.
            </p>
          </section>
          <section class="panel">
            <h2>Карьерная цель</h2>
            <p class="section">
              {{
                store.profile.careerGoal
                  ? store.profile.careerGoal.target_role +
                    " · " +
                    store.profile.careerGoal.target_grade
                  : "Цель не указана"
              }}
            </p>
            <p class="small muted">
              Траектория API рассчитывается для следующего грейда текущей роли.
            </p>
          </section>
          <section class="panel">
            <div class="panel-head">
              <h2>История участия</h2>
              <NuxtLink v-if="!hr" to="/activities" class="inline-link"
                >Все записи</NuxtLink
              >
            </div>
            <CqRecent
              :history="store.history"
              :hr="hr"
              :limit="hr ? store.history.length : 4"
            />
          </section>
        </div>
      </div>
    </div>
  </CqAsync>
</template>
