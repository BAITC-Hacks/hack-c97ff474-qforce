<script setup>
const { t, uiError, catalogText, unit } = useLocale();
import { formats } from "../utils/labels.js";
const { request } = useApi();
const { store, loadEmployee } = useCareer();
const rows = ref([]),
  page = ref(1),
  total = ref(0),
  format = ref(""),
  loading = ref(true),
  error = ref("");
let version = 0;
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = "";
  try {
    const result = await request("/activities", {
      query: {
        page: page.value,
        pageSize: 9,
        format: format.value,
        locale: "ru",
      },
    });
    if (current === version) {
      rows.value = result.data;
      total.value = result.meta.total;
    }
  } catch (e) {
    if (current === version) error.value = uiError(e);
  } finally {
    if (current === version) loading.value = false;
  }
}
watch(format, () => {
  if (page.value !== 1) page.value = 1;
  else load();
});
watch(page, load);
onMounted(() => {
  load();
  loadEmployee();
});
</script>
<template>
  <div>
    <CqHeading
      :title="t('Каталог развития')"
      :subtitle="t('Изучайте возможности обучения и развития.')"
    />
    <form class="filters" @submit.prevent="load">
      <select
        v-model="format"
        class="select"
        :aria-label="t('Формат активности')"
      >
        <option value="">{{ t("Все форматы") }}</option>
        <option v-for="(name, key) in formats" :key="key" :value="key">
          {{ t(name) }}
        </option></select
      ><button class="btn secondary" :disabled="loading">
        {{ t("Обновить") }}<CqIcon name="refresh" />
      </button>
    </form>
    <CqAsync :loading="loading" :error="error" @retry="load">
      <div class="grid three">
        <article
          v-for="activity in rows"
          :key="activity.id"
          class="panel rec-card"
        >
          <div class="rec-top">
            <span class="mini-icon"><CqIcon name="book" /></span
            ><CqTag :color="activity.mandatory ? 'gold' : 'green'">{{
              t(activity.mandatory ? "Обязательная" : "Добровольная")
            }}</CqTag>
          </div>
          <h3>{{ catalogText(activity, "title") }}</h3>
          <div class="tags">
            <CqTag>{{ t(formats[activity.format]) }}</CqTag
            ><CqTag>{{ unit(activity.durationHours, "hour") }}</CqTag>
          </div>
          <p class="desc">{{ catalogText(activity, "description") }}</p>
          <CqTag
            v-if="
              store.eligible?.eligible.some(
                (row) => row.activity.id === activity.id,
              )
            "
            color="green"
            >{{ t("Подходит для развития") }}</CqTag
          ><NuxtLink
            :to="{ path: '/event', query: { id: activity.id } }"
            class="btn secondary section"
            >{{ t("Посмотреть") }}<CqIcon name="arrow"
          /></NuxtLink>
        </article>
      </div>
      <div v-if="!rows.length" class="panel empty-inline">
        {{ t("Активностей с такими фильтрами нет.") }}
      </div>
      <div class="pagination">
        <span>{{
          t("Страница {p0} · всего {p1}", { p0: page, p1: total })
        }}</span>
        <div class="actions">
          <button class="btn secondary" :disabled="page <= 1" @click="page--">
            {{ t("Назад") }}</button
          ><button
            class="btn secondary"
            :disabled="page * 9 >= total"
            @click="page++"
          >
            {{ t("Далее") }}
          </button>
        </div>
      </div>
    </CqAsync>
  </div>
</template>
