<script setup>
const { t, unit } = useLocale();
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
        :title="t(hr ? store.profile.fullName : 'Мой профиль и навыки')"
        :subtitle="t('Актуальные навыки, карьерная цель и история развития.')"
        ><NuxtLink :to="hr ? '/hr-people' : '/path'" class="btn secondary"
          >{{ t(hr ? "К списку сотрудников" : "Карьерная траектория") }}
          <CqIcon name="arrow" /></NuxtLink
      ></CqHeading>
      <div class="grid aside-main">
        <div class="stack">
          <section class="panel profile-info">
            <div class="avatar big">{{ t(initials(store.profile)) }}</div>
            <h2>{{ t(store.profile.fullName) }}</h2>
            <p class="role">{{ t(roleName(store.profile.roleId)) }}</p>
            <div class="tags">
              <CqTag color="green">{{
                t(gradeName(store.profile.gradeId))
              }}</CqTag
              ><CqTag color="outline">{{ t(store.profile.id) }}</CqTag>
            </div>
            <dl class="details-list">
              <div>
                <dt>{{ t("Стаж") }}</dt>
                <dd>
                  {{ unit(store.profile.tenureMonths, "month") }}
                </dd>
              </div>
              <div>
                <dt>{{ t("Формат работы") }}</dt>
                <dd>
                  {{
                    t(
                      { office: "Офис", hybrid: "Гибрид", remote: "Удалённо" }[
                        store.profile.workFormat
                      ] || store.profile.workFormat,
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>{{ t("Оценка навыков") }}</dt>
                <dd>{{ t(date(store.profile.lastReviewDate)) }}</dd>
              </div>
              <div>
                <dt>{{ t("Подразделение") }}</dt>
                <dd>{{ t(store.profile.department) }}</dd>
              </div>
              <div>
                <dt>{{ t("Руководитель (ID)") }}</dt>
                <dd>{{ t(store.profile.managerId || "Не назначен") }}</dd>
              </div>
            </dl>
          </section>
          <CqNotice>{{
            t(
              "Уровни навыков учитывают сохранённые завершения. Автоматического повышения грейда нет.",
            )
          }}</CqNotice>
          <section class="panel">
            <div class="section-kicker">
              {{ t("Соответствие следующему грейду") }}
            </div>
            <div class="big-progress">
              {{ t(percent(store.trajectory.readinessPercent)) }}
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="panel">
            <div class="panel-head">
              <h2>
                {{
                  t("Навыки для грейда {p0}", {
                    p0: gradeName(store.trajectory.nextGradeId),
                  })
                }}
              </h2>
            </div>
            <CqSkill
              v-for="gap in store.trajectory.gaps"
              :key="gap.skillId"
              :gap="gap"
            />
            <p v-if="!store.trajectory.gaps.length" class="empty-inline">
              {{ t("Требования для следующего грейда не заданы.") }}
            </p>
          </section>
          <section class="panel">
            <h2>{{ t("Карьерная цель") }}</h2>
            <p class="section">
              {{
                t(
                  store.profile.careerGoal
                    ? roleName(store.profile.careerGoal.target_role) +
                        " · " +
                        gradeName(store.profile.careerGoal.target_grade)
                    : "Цель не указана",
                )
              }}
            </p>
            <p class="small muted">
              {{
                t(
                  "Траектория API рассчитывается для следующего грейда текущей роли.",
                )
              }}
            </p>
          </section>
          <section class="panel">
            <div class="panel-head">
              <h2>{{ t("История участия") }}</h2>
              <NuxtLink v-if="!hr" to="/activities" class="inline-link">{{
                t("Все записи")
              }}</NuxtLink>
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
