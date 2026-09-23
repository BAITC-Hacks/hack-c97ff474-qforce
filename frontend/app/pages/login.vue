<script setup>
definePageMeta({ layout: "auth" });
const { store, selectEmployee, save } = useCareer(),
  employeeId = ref(store.state.employeeId),
  mode = ref(store.state.mode);
function submit() {
  selectEmployee(employeeId.value);
  store.state.mode = mode.value;
  save();
  navigateTo(mode.value === "hr" ? "/hr-dashboard" : "/dashboard");
}
</script>
<template>
  <div>
    <div class="eyebrow text-primary">Начните с вашего профиля</div>
    <h2>Добро пожаловать</h2>
    <p>
      Исследуйте карьерный навигатор на синтетических данных стартового набора.
    </p>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="loginEmployee">Демонстрационный сотрудник</label
        ><select id="loginEmployee" v-model="employeeId" class="select">
          <option
            v-for="e in store.data.employees"
            :key="e.employee_id"
            :value="e.employee_id"
          >
            {{ e.full_name }} · {{ e.grade }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="loginRole">Режим просмотра</label
        ><select id="loginRole" v-model="mode" class="select">
          <option value="employee">Сотрудник — мой путь развития</option>
          <option value="hr">HR — обзор развития команды</option>
        </select>
      </div>
      <button type="submit" class="btn wide">
        Открыть демо <CqIcon name="arrow" />
      </button>
    </form>
    <div class="section">
      <CqNotice
        >Корпоративный пароль не нужен и не запрашивается. Это макет входа, а не
        настоящая авторизация.</CqNotice
      >
    </div>
    <div class="auth-return">
      Нужен новый профиль?
      <NuxtLink to="/register" class="auth-link">Создать в демо</NuxtLink>
    </div>
    <div class="login-divider">
      {{ store.data.employees.length }} профилей ·
      {{ store.data.events.length }} активностей ·
      {{ store.data.skills.length }} навыков<br />Дата исходного набора: 1
      октября 2026 года
    </div>
    <div class="actions section">
      <NuxtLink to="/ui-kit" class="btn ghost"
        >Дизайн-система <CqIcon name="layers" /></NuxtLink
      ><NuxtLink to="/screens" class="btn ghost"
        >Все экраны <CqIcon name="arrow"
      /></NuxtLink>
    </div>
  </div>
</template>
