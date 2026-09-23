<script setup>
definePageMeta({ layout: "auth" });
const { store, createProfile, E } = useCareer(),
  name = ref(""),
  role = ref("Backend Engineer"),
  grade = ref("Junior"),
  error = ref("");
const roles = computed(() => [
  ...new Set(store.data.role_profiles.map((r) => r.role)),
]);
function submit() {
  if (name.value.trim().length < 2) {
    error.value = "Введите не менее двух символов.";
    return;
  }
  if (createProfile(name.value, role.value, grade.value))
    navigateTo("/profile");
}
</script>
<template>
  <div>
    <div class="eyebrow text-primary">Новое пространство развития</div>
    <h2>Создайте свой профиль</h2>
    <p>Регистрация в локальном демо. Используйте вымышленное имя.</p>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="registerName">Имя и фамилия</label
        ><input
          id="registerName"
          v-model="name"
          class="input"
          required
          minlength="2"
          maxlength="80"
          placeholder="Например, Alex Demo"
          autocomplete="off"
        />
      </div>
      <div class="field">
        <label for="registerRole">Профессиональная роль</label
        ><select id="registerRole" v-model="role" class="select">
          <option v-for="r in roles" :key="r">{{ r }}</option>
        </select>
      </div>
      <div class="field">
        <label for="registerGrade">Текущий грейд</label
        ><select id="registerGrade" v-model="grade" class="select">
          <option v-for="g in E.GRADES" :key="g">{{ g }}</option>
        </select>
      </div>
      <div v-if="error" class="form-error" role="alert">{{ error }}</div>
      <button type="submit" class="btn wide">
        Создать демо-профиль <CqIcon name="arrow" />
      </button>
    </form>
    <div class="section">
      <CqNotice
        >Профиль сохранится в этом браузере. Начальные навыки соответствуют
        матрице выбранного грейда. Для точных уровней используйте импорт
        JSON.</CqNotice
      >
    </div>
    <div class="auth-return">
      Уже есть профиль?
      <NuxtLink to="/login" class="auth-link">Войти в демо</NuxtLink>
    </div>
  </div>
</template>
