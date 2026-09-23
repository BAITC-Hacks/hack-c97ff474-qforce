<script setup>
const { t } = useLocale();
import { pages } from "../utils/pages.js";
</script>
<template>
  <div>
    <CqHeading
      :title="t('Все экраны QCareer')"
      :subtitle="
        t('Карта разделов Career Quest. Доступ зависит от роли учётной записи.')
      "
      ><NuxtLink to="/login" class="btn secondary"
        >{{ t("Войти") }}<CqIcon name="arrow" /></NuxtLink
    ></CqHeading>
    <div
      v-for="group in [
        'Сотрудник',
        'HR',
        'Сервис',
        'Состояние',
        'Передача в разработку',
      ]"
      :key="group"
      class="section"
    >
      <div class="panel-head">
        <h2>{{ t(group) }}</h2>
      </div>
      <div class="grid three">
        <NuxtLink
          v-for="(p, i) in pages.filter(
            (p) => p[2] === group && p[0] !== 'screens',
          )"
          :key="p[0]"
          :to="'/' + p[0]"
          class="panel screen-card"
          ><div class="screen-no">
            {{ t(String(i + 1).padStart(2, "0")) }} / {{ t(p[0]) }}
          </div>
          <div class="flex items-center justify-between gap-3">
            <h3>{{ t(p[1]) }}</h3>
            <CqIcon name="arrow" /></div
        ></NuxtLink>
      </div>
    </div>
  </div>
</template>
