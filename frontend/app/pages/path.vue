<script setup>
const { store, current, saveGoal, E } = useCareer();
const goal = reactive({ target_role: "", target_grade: "" });
watch(
  () => current.value.p.goal,
  (g) => Object.assign(goal, g),
  { immediate: true },
);
const roles = computed(() => [
  ...new Set(store.data.role_profiles.map((r) => r.role)),
]);
</script>
<template>
  <div>
    <CqHeading
      title="Ваш карьерный путь"
      subtitle="Не просто следующий грейд — понятные требования и реалистичные шаги."
      ><NuxtLink to="/recommendations" class="btn"
        >Подобрать активности <CqIcon name="spark" /></NuxtLink
    ></CqHeading>
    <div class="panel">
      <div class="grid main-aside">
        <div>
          <div class="section-kicker">Текущая роль</div>
          <h2>{{ current.employee.role }}</h2>
          <div class="path-line">
            <div
              v-for="(g, i) in E.GRADES"
              :key="g"
              class="path-node"
              :class="{
                done: i < E.GRADES.indexOf(current.employee.grade),
                current: g === current.employee.grade,
                goal:
                  g !== current.employee.grade &&
                  g === current.p.goal.target_grade,
              }"
            >
              <div class="node">
                {{ i < E.GRADES.indexOf(current.employee.grade) ? "✓" : i + 1 }}
              </div>
              <strong>{{ g }}</strong
              ><small>{{
                g === current.employee.grade
                  ? "Вы здесь"
                  : g === current.p.goal.target_grade
                    ? "Выбранная цель"
                    : "Уровень"
              }}</small>
            </div>
          </div>
        </div>
        <div class="panel bg-[#F5F9F1] shadow-none">
          <div class="section-kicker">Покрытие требований</div>
          <div class="big-progress">
            {{ current.p.progress }}<small>%</small>
          </div>
          <p class="small muted mt-2">
            {{ current.p.met }} из {{ current.p.gaps.length }} навыков достигли
            целевого уровня
          </p>
        </div>
      </div>
    </div>
    <div class="grid main-aside section">
      <section class="panel">
        <div class="panel-head">
          <h2>Что нужно развить</h2>
          <CqTag color="gold"
            >{{ current.p.criticalOpen.length }} критических разрыва</CqTag
          >
        </div>
        <CqSkill
          v-for="g in current.p.gaps
            .filter((g) => g.gap > 0)
            .sort((a, b) => Number(b.critical) - Number(a.critical))"
          :key="g.id"
          :gap="g"
        />
        <div
          v-if="current.p.met === current.p.gaps.length"
          class="empty-inline"
        >
          Все требования по навыкам для этой цели закрыты.
        </div>
        <div class="section">
          <CqNotice
            >100% означает только соответствие указанным навыкам. Повышение
            подтверждается отдельным решением компании.</CqNotice
          >
        </div>
      </section>
      <div class="stack">
        <form class="panel" @submit.prevent="saveGoal(goal)">
          <h2>Моя цель</h2>
          <p class="small muted mt-2">
            Можно развиваться в своей роли или изучить другую профессию.
          </p>
          <div class="field">
            <label for="targetRole">Целевая роль</label
            ><select id="targetRole" v-model="goal.target_role" class="select">
              <option v-for="role in roles" :key="role">{{ role }}</option>
            </select>
          </div>
          <div class="field">
            <label for="targetGrade">Целевой грейд</label
            ><select
              id="targetGrade"
              v-model="goal.target_grade"
              class="select"
            >
              <option v-for="grade in E.GRADES" :key="grade">
                {{ grade }}
              </option>
            </select>
          </div>
          <button class="btn wide" type="submit">
            Сохранить цель <CqIcon name="check" />
          </button>
          <div class="section">
            <CqNotice :color="current.p.goal.inferred ? 'gold' : ''">{{
              current.p.goal.inferred
                ? "Цель в исходном профиле отсутствует. Показан предложенный вариант — подтвердите его или выберите другой."
                : "Рекомендации сравнивают ваши навыки именно с выбранной целью."
            }}</CqNotice>
          </div>
        </form>
        <section class="panel">
          <div class="section-kicker">Смена профессии</div>
          <h3>Траектория ≠ доступ к курсу</h3>
          <p class="small muted section">
            При смене роли требования сравниваются с новой профессией, но
            ограничения аудитории мероприятий сохраняются. Расширенный доступ
            согласуется с HR.
          </p>
        </section>
      </div>
    </div>
    <section class="panel section">
      <h2>Как считается прогресс</h2>
      <p class="small muted section">
        Среднее по навыкам целевой роли: min(текущий уровень / требуемый
        уровень, 1) × 100%. Критические разрывы показываются отдельно и не
        скрываются средним значением.
      </p>
      <div class="source section">
        target_role + target_grade → role_profiles.required_skills /
        critical_skills
      </div>
    </section>
  </div>
</template>
