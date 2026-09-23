<script setup>
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
      <CqHeading
        title="Ваш карьерный путь"
        subtitle="Понятные требования и реалистичные шаги."
        ><NuxtLink to="/recommendations" class="btn"
          >Подобрать активности <CqIcon name="spark" /></NuxtLink
      ></CqHeading>
      <section class="panel">
        <div class="grid main-aside">
          <div>
            <div class="section-kicker">Текущая роль</div>
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
                  grade.id === store.profile.gradeId
                    ? "Вы здесь"
                    : grade.id === store.trajectory.nextGradeId
                      ? "Следующий грейд"
                      : "Уровень"
                }}</small>
              </div>
            </div>
          </div>
          <div class="panel bg-[#F5F9F1] shadow-none">
            <div class="section-kicker">Соответствие навыков</div>
            <div class="big-progress">
              {{ percent(store.trajectory.readinessPercent) }}
            </div>
            <p class="small muted section">
              {{ trajectoryStatus[store.trajectory.status] }}
            </p>
          </div>
        </div>
      </section>
      <div class="grid main-aside section">
        <section class="panel">
          <h2>
            Требования к грейду {{ gradeName(store.trajectory.nextGradeId) }}
          </h2>
          <CqSkill
            v-for="gap in store.trajectory.gaps"
            :key="gap.skillId"
            :gap="gap"
          />
          <p v-if="!store.trajectory.gaps.length" class="empty-inline">
            Требования не заданы.
          </p>
          <CqNotice
            >100% означает соответствие навыкам. Повышение подтверждается
            отдельным решением компании.</CqNotice
          >
        </section>
        <div class="stack">
          <section class="panel">
            <h2>Моя цель</h2>
            <p class="section">
              {{
                store.profile.careerGoal
                  ? store.profile.careerGoal.target_role +
                    " · " +
                    store.profile.careerGoal.target_grade
                  : "Цель не указана"
              }}
            </p>
            <CqNotice color="gold"
              >Изменение цели пока недоступно. Обратитесь к HR для актуализации
              профиля. Траектория строится к следующему грейду текущей
              роли.</CqNotice
            >
          </section>
          <section class="panel">
            <h2>Как считается прогресс</h2>
            <p class="small muted section">
              Сервер делит сумму min(текущий уровень, требование) на сумму
              положительных требований и умножает на 100%. Если данных
              недостаточно, процент не показывается.
            </p>
          </section>
        </div>
      </div>
    </div></CqAsync
  >
</template>
