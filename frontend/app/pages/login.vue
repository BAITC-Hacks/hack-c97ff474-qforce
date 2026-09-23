<script setup>
definePageMeta({ layout: "auth" });
const { login, session } = useApi();
const { logout } = useCareer();
const username = ref(""),
  password = ref(""),
  busy = ref(false),
  error = ref("");
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  logout();
  try {
    const user = await login(username.value.trim(), password.value);
    password.value = "";
    await navigateTo(user.role === "HR" ? "/hr-dashboard" : "/dashboard");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div>
    <div class="eyebrow text-primary">Начните с вашего профиля</div>
    <h2>Добро пожаловать</h2>
    <p>Войдите в свою учётную запись Career Quest.</p>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="username">Имя пользователя</label
        ><input
          id="username"
          v-model="username"
          class="input"
          autocomplete="username"
          required
          :disabled="busy"
        />
      </div>
      <div class="field">
        <label for="password">Пароль</label
        ><input
          id="password"
          v-model="password"
          class="input"
          type="password"
          autocomplete="current-password"
          required
          :disabled="busy"
        />
      </div>
      <CqNotice v-if="error || session.error" color="red" role="alert">{{
        error || session.error
      }}</CqNotice>
      <button type="submit" class="btn wide section" :disabled="busy">
        {{ busy ? "Входим…" : "Войти" }} <CqIcon name="arrow" />
      </button>
    </form>
    <div class="section">
      <CqNotice
        >Доступ к профилю и HR-разделам определяется вашей учётной
        записью.</CqNotice
      >
    </div>
    <div class="auth-return">
      Нет учётной записи?
      <NuxtLink to="/register" class="auth-link">Как получить доступ</NuxtLink>
    </div>
  </div>
</template>
