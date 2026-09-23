<script setup>
import { t } from '../utils/i18n.js';
import { percent, trajectoryStatus } from "../utils/labels.js";
const { store, loadEmployee, roleName, gradeName } = useCareer();
onMounted(() => loadEmployee());
</script>
<template>
  <CqAsync
    :loading="store.loading"
    :error="store.error"
    :empty="!store.profile"
    @retry="loadEmployee()"
    ><div v-if="store.profile">
      <CqDataWarnings />
      <CqHeading
        :title="t('Ваш карьерный путь')"
        :subtitle="t('Понятные требования и реалистичные шаги.')"
        ><NuxtLink to="/recommendations" class="btn"
          > {{ t("Подобрать активности") }} <CqIcon name="spark" /></NuxtLink
      ></CqHeading>
      <section class="panel">
        <div class="grid main-aside">
          <div>
            <div class="section-kicker"> {{ t("Текущая роль") }} </div>
            <h2>{{ roleName(store.profile.roleId) }}</h2>
            <div class="path-line">
              <div
                v-for="(grade, index) in store.grades"
                :key="grade.id"
                class="path-node"
                :class="{
                  current: grade.id === store.profile.gradeId,
                  goal: grade.id === store.trajectory.nextGradeId,
                }"
              >
                <div class="node">{{ index + 1 }}</div>
                <strong>{{ grade.name }}</strong
                ><small>{{
                  t(grade.id === store.profile.gradeId
                    ? "Вы здесь"
                    : grade.id === store.trajectory.nextGradeId
                      ? "Следующий грейд"
                      : "Уровень")
                }}</small>
              </div>
            </div>
          </div>
          <div class="panel bg-[#F5F9F1] shadow-none">
            <div class="section-kicker"> {{ t("Соответствие навыков") }} </div>
            <div class="big-progress">
              {{ percent(store.trajectory.readinessPercent) }}
            </div>
            <p class="small muted section">
              {{ t(trajectoryStatus[store.trajectory.status]) }}
            </p>
          </div>
        </div>
      </section>
      <div class="grid main-aside section">
        <section class="panel">
          <h2> {{ t("Требования к грейду") }} {{ gradeName(store.trajectory.nextGradeId) }}
          </h2>
          <CqSkill
            v-for="gap in store.trajectory.gaps"
            :key="gap.skillId"
            :gap="gap"
          />
          <p v-if="!store.trajectory.gaps.length" class="empty-inline"> {{ t("Требования не заданы.") }} </p>
          <CqNotice
            > {{ t("100% означает соответствие навыкам. Повышение подтверждается отдельным решением компании.") }} </CqNotice
          >
        </section>
        <div class="stack">
          <section class="panel">
            <h2> {{ t("Моя цель") }} </h2>
            <p class="section">
              {{
                t(store.profile.careerGoal
                  ? store.profile.careerGoal.target_role +
                    " · " +
                    store.profile.careerGoal.target_grade
                  : "Цель не указана")
              }}
            </p>
            <CqNotice color="gold"
              > {{ t("Изменение цели пока недоступно. Обратитесь к HR для актуализации профиля. Траектория строится к следующему грейду текущей роли.") }} </CqNotice
            >
          </section>
          <section class="panel">
            <h2> {{ t("Как считается прогресс") }} </h2>
            <p class="small muted section"> {{ t("Сервер делит сумму min(текущий уровень, требование) на сумму положительных требований и умножает на 100%. Если данных недостаточно, процент не показывается.") }} </p>
          </section>
        </div>
      </div>
    </div></CqAsync
  >
</template>
