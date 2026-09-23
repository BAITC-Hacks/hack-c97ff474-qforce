<script setup>
import { eventTitle, formats } from "../utils/labels.js";
const { store, employee, E, skillName } = useCareer(),
  query = ref(""),
  format = ref("all"),
  count = ref(9);
const filtered = computed(() =>
  store.data.events.filter(
    (v) =>
      !v.mandatory &&
      `${eventTitle(v)} ${v.title}`
        .toLowerCase()
        .includes(query.value.toLowerCase()) &&
      (format.value === "all" || v.format === format.value),
  ),
);
const rows = computed(() =>
  filtered.value
    .slice(0, count.value)
    .map((v) =>
      E.inspect(
        store.data,
        employee.value,
        v,
        store.state.asOf,
        store.state.goals[employee.value.employee_id],
      ),
    ),
);
watch([query, format], () => (count.value = 9));
</script>
<template>
  <div>
    <CqHeading
      title="Каталог развития"
      subtitle="Исследуйте возможности. Доступность рассчитывается под ваш профиль."
      ><CqTag color="green"
        >{{ store.data.events.filter((e) => !e.mandatory).length }} добровольных
        активностей</CqTag
      ></CqHeading
    >
    <form class="filters" @submit.prevent="count = 9">
      <input
        v-model="query"
        class="input grow"
        placeholder="Поиск по названию активности"
        aria-label="Поиск по каталогу"
      /><select v-model="format" class="select" aria-label="Формат активности">
        <option value="all">Все форматы</option>
        <option v-for="(name, key) in formats" :key="key" :value="key">
          {{ name }}
        </option></select
      ><button type="submit" class="btn secondary">
        Найти <CqIcon name="search" />
      </button>
    </form>
    <div class="grid three">
      <article v-for="r in rows" :key="r.event.event_id" class="panel rec-card">
        <div class="rec-top">
          <span class="mini-icon"
            ><CqIcon
              :name="r.event.type === 'mentoring' ? 'people' : 'book'" /></span
          ><CqTag :color="r.eligible ? 'green' : 'outline'">{{
            r.eligible ? "Доступно" : "Есть ограничения"
          }}</CqTag>
        </div>
        <h3>{{ eventTitle(r.event) }}</h3>
        <div class="tags">
          <CqTag>{{ formats[r.event.format] }}</CqTag
          ><CqTag>{{ r.event.duration_hours }} ч</CqTag>
        </div>
        <p class="desc">
          {{ r.eligible ? "Сокращает разрыв до выбранной цели." : r.why[0] }}
        </p>
        <div class="tags">
          <CqTag
            v-for="s in r.event.develops_skills.slice(0, 2)"
            :key="s.skill_id"
            color="outline"
            >{{ skillName(s.skill_id) }}</CqTag
          >
        </div>
        <NuxtLink
          :to="{ path: '/event', query: { id: r.event.event_id } }"
          class="btn secondary"
          >Посмотреть <CqIcon name="arrow"
        /></NuxtLink>
      </article>
    </div>
    <div v-if="!rows.length" class="empty-inline">
      По вашему запросу ничего не найдено. Попробуйте другое название или
      формат.
    </div>
    <div class="pagination">
      <span>Показано {{ rows.length }} из {{ filtered.length }}</span
      ><button
        v-if="rows.length < filtered.length"
        class="btn secondary"
        @click="count += 9"
      >
        Показать ещё <CqIcon name="arrow" />
      </button>
    </div>
  </div>
</template>
