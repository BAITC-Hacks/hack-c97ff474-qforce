<script setup>
const { t, uiError } = useLocale();
definePageMeta({ layout: "auth" });
const { login, session } = useApi();
const { logout } = useCareer();
const username = ref(""),
  password = ref(""),
  busy = ref(false),
  error = ref("");
async function submit() {
  if (busy.value) return;
  if (!username.value.trim() || !password.value) {
    error.value = "Введите имя пользователя и пароль.";
    return;
  }
  busy.value = true;
  error.value = "";
  logout();
  try {
    const user = await login(username.value.trim(), password.value);
    password.value = "";
    await navigateTo(user.role === "HR" ? "/hr-dashboard" : "/dashboard");
  } catch (e) {
    error.value = uiError(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div>
    <div class="eyebrow text-primary">{{ t("Начните с вашего профиля") }}</div>
    <h2>{{ t("Добро пожаловать") }}</h2>
    <p>{{ t("Войдите в свою учётную запись Career Quest.") }}</p>
    <form novalidate @submit.prevent="submit">
      <div class="field">
        <label for="username">{{ t("Имя пользователя") }}</label
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
        <label for="password">{{ t("Пароль") }}</label
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
        t(error || session.error)
      }}</CqNotice>
      <button type="submit" class="btn wide section" :disabled="busy">
        {{ t(busy ? "Входим…" : "Войти") }} <CqIcon name="arrow" />
      </button>
    </form>
    <div class="section">
      <CqNotice>{{
        t("Доступ к профилю и HR-разделам определяется вашей учётной записью.")
      }}</CqNotice>
    </div>
    <div class="auth-return">
      {{ t("Нет учётной записи?")
      }}<NuxtLink to="/register" class="auth-link">{{
        t("Как получить доступ")
      }}</NuxtLink>
    </div>
  </div>
</template>
