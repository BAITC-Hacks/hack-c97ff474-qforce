<script setup>
import { titles, employeeMenu, hrMenu } from "../utils/pages.js";
import { initials, date } from "../utils/labels.js";
const route = useRoute(),
  { store, employee, selectEmployee, save } = useCareer(),
  mobileOpen = ref(false);
const page = computed(() =>
  route.path === "/" ? "dashboard" : route.path.slice(1),
);
const hr = computed(
  () => page.value.startsWith("hr-") || page.value === "import",
);
const menu = computed(() => (hr.value ? hrMenu : employeeMenu));
watch(
  () => route.path,
  () => {
    mobileOpen.value = false;
    if (hr.value) {
      store.state.mode = "hr";
      save();
    }
  },
);
</script>
<template>
  <a href="#main" class="skip-link">Перейти к содержимому</a>
  <div v-if="mobileOpen" class="nav-overlay" @click="mobileOpen = false" />
  <aside class="sidebar" :class="{ 'mobile-open': mobileOpen }">
    <CqBrand /><button
      class="mobile-close"
      aria-label="Закрыть меню"
      @click="mobileOpen = false"
    >
      <CqIcon name="x" />
    </button>
    <div class="nav-group">
      {{ hr ? "HR-ПРОСТРАНСТВО" : "МОЁ ПРОСТРАНСТВО" }}
    </div>
    <NuxtLink
      v-for="item in menu"
      :key="item[0]"
      :to="'/' + item[0]"
      class="nav-item"
      :class="{ active: page === item[0] }"
      :aria-current="page === item[0] ? 'page' : undefined"
      ><CqIcon :name="item[2]" />{{ item[1] }}</NuxtLink
    >
    <div class="sidebar-bottom">
      <div class="side-note">
        <strong><CqIcon name="shield" /> Развитие без сравнения</strong>Ваш путь
        — не соревнование. Здесь нет публичных рейтингов сотрудников.
      </div>
      <NuxtLink
        to="/settings"
        class="nav-item"
        :class="{ active: page === 'settings' }"
        ><CqIcon name="settings" />Настройки</NuxtLink
      ><NuxtLink to="/login" class="nav-item"
        ><CqIcon name="logout" />Сменить режим</NuxtLink
      >
    </div>
  </aside>
  <div class="shell">
    <header class="topbar">
      <button
        class="mobile-menu"
        aria-label="Открыть меню"
        :aria-expanded="mobileOpen"
        @click="mobileOpen = !mobileOpen"
      >
        <CqIcon name="layers" />
      </button>
      <div class="crumb">
        <NuxtLink to="/" class="hide-mobile">QCareer</NuxtLink
        ><span class="hide-mobile">/</span
        ><span>{{ titles[page] || "Обзор" }}</span>
      </div>
      <div class="top-controls">
        <div class="role-toggle" aria-label="Режим демонстрации">
          <NuxtLink :class="{ selected: !hr }" to="/dashboard"
            >Сотрудник</NuxtLink
          ><NuxtLink :class="{ selected: hr }" to="/hr-dashboard">HR</NuxtLink>
        </div>
        <span class="lang small muted">RU</span>
        <div class="avatar">{{ initials(employee) }}</div>
        <select
          class="employee-select"
          :value="employee.employee_id"
          aria-label="Демонстрационный выбор сотрудника"
          @change="selectEmployee($event.target.value)"
        >
          <option
            v-for="e in store.data.employees"
            :key="e.employee_id"
            :value="e.employee_id"
          >
            {{ e.full_name }} · {{ e.employee_id }}
          </option>
        </select>
      </div>
    </header>
    <main id="main" class="content" tabindex="-1">
      <slot />
      <footer class="bottom-note">
        <span>QCareer · концепт для HackAlem · синтетические данные</span
        ><span
          >Срез {{ date(store.state.asOf) }} · демо без LLM и серверной
          авторизации</span
        >
      </footer>
    </main>
  </div>
  <nav class="mobile-nav" aria-label="Основная навигация">
    <NuxtLink
      v-for="item in menu.slice(0, 4)"
      :key="item[0]"
      :to="'/' + item[0]"
      :class="{ active: page === item[0] }"
      ><CqIcon :name="item[2]" /><span>{{ item[1] }}</span></NuxtLink
    ><button @click="mobileOpen = true">
      <CqIcon name="layers" /><span>Ещё</span>
    </button>
  </nav>
</template>
