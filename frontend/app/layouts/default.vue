<script setup>
import { t } from '../utils/i18n.js';
import { titles, employeeMenu, hrMenu } from "../utils/pages.js";
import { initials } from "../utils/labels.js";
const route = useRoute(),
  { store, logout } = useCareer(),
  mobileOpen = ref(false);
const page = computed(() =>
  route.path === "/" ? "dashboard" : route.path.slice(1),
);
const hr = computed(() => store.user?.role === "HR");
const menu = computed(() => (hr.value ? hrMenu : employeeMenu));
watch(
  () => route.path,
  () => {
    mobileOpen.value = false;
  },
);
function signOut() {
  logout();
  navigateTo("/login");
}
</script>
<template>
  <a href="#main" class="skip-link"> {{ t("Перейти к содержимому") }} </a>
  <div v-if="mobileOpen" class="nav-overlay" @click="mobileOpen = false" />
  <aside class="sidebar" :class="{ 'mobile-open': mobileOpen }">
    <CqBrand /><button
      class="mobile-close"
      :aria-label="t('Закрыть меню')"
      @click="mobileOpen = false"
    >
      <CqIcon name="x" />
    </button>
    <div class="nav-group">
      {{ t(hr ? "HR-ПРОСТРАНСТВО" : "МОЁ ПРОСТРАНСТВО") }}
    </div>
    <NuxtLink
      v-for="item in menu"
      :key="item[0]"
      :to="'/' + item[0]"
      class="nav-item"
      :class="{ active: page === item[0] }"
      :aria-current="page === item[0] ? 'page' : undefined"
      ><CqIcon :name="item[2]" />{{ t(item[1]) }}</NuxtLink
    >
    <div class="sidebar-bottom">
      <div class="side-note">
        <strong><CqIcon name="shield" /> {{ t("Развитие без сравнения") }} </strong> {{ t("Ваш путь — не соревнование. Здесь нет публичных рейтингов сотрудников.") }} </div>
      <NuxtLink to="/settings" class="nav-item"
        ><CqIcon name="settings" /> {{ t("Настройки") }} </NuxtLink
      >
      <button v-if="store.user" class="nav-item" @click="signOut">
        <CqIcon name="logout" /> {{ t("Выйти") }} </button>
      <NuxtLink v-else to="/login" class="nav-item"> {{ t("Войти") }} </NuxtLink>
    </div>
  </aside>
  <div class="shell">
    <header class="topbar">
      <button
        class="mobile-menu"
        :aria-label="t('Открыть меню')"
        :aria-expanded="mobileOpen"
        @click="mobileOpen = !mobileOpen"
      >
        <CqIcon name="layers" />
      </button>
      <div class="crumb">
        <NuxtLink :to="hr ? '/hr-dashboard' : '/dashboard'" class="hide-mobile"
          >QCareer</NuxtLink
        ><span class="hide-mobile">/</span
        ><span>{{ t(titles[page] || "Обзор") }}</span>
      </div>
      <div class="top-controls">
        <CqTag color="green">{{ t(hr ? "HR" : "Сотрудник") }}</CqTag
        ><CqLanguage />
        <div class="avatar">
          {{
            initials(
              hr ? { fullName: store.user?.username || "HR" } : store.profile,
            )
          }}
        </div>
      </div>
    </header>
    <main id="main" class="content" tabindex="-1">
      <slot />
      <footer class="bottom-note">
        <span> {{ t("QCareer · развитие в своём темпе") }} </span
        ><span> {{ t("Данные и прогресс сохраняются на сервере") }} </span>
      </footer>
    </main>
  </div>
  <nav class="mobile-nav" :aria-label="t('Основная навигация')">
    <NuxtLink
      v-for="item in menu.slice(0, 4)"
      :key="item[0]"
      :to="'/' + item[0]"
      :class="{ active: page === item[0] }"
      ><CqIcon :name="item[2]" /><span>{{ t(item[1]) }}</span></NuxtLink
    >
    <button @click="mobileOpen = true">
      <CqIcon name="layers" /><span> {{ t("Ещё") }} </span>
    </button>
  </nav>
</template>
