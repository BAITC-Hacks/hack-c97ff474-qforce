<script setup>
import { eventTitle, formats, date, statuses } from "../utils/labels.js";
const props = defineProps({
  history: Array,
  limit: { type: Number, default: 4 },
});
const { store } = useCareer();
const rows = computed(() =>
  props.history
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, props.limit)
    .map((r) => ({
      ...r,
      event: store.data.events.find((e) => e.event_id === r.event_id),
    })),
);
</script>
<template>
  <div v-for="r in rows" :key="r.record_id" class="activity-line">
    <span class="mini-icon"
      ><CqIcon :name="r.event.mandatory ? 'shield' : 'book'"
    /></span>
    <div>
      <NuxtLink
        class="activity-title"
        :to="{ path: '/event', query: { id: r.event_id } }"
        >{{ eventTitle(r.event) }}</NuxtLink
      >
      <div class="activity-date">
        {{ date(r.date) }} ·
        {{
          r.event.mandatory
            ? "Обязательное назначение"
            : formats[r.event.format]
        }}
      </div>
    </div>
    <div class="tags">
      <CqTag :color="statuses[r.status]?.[1]">{{
        statuses[r.status]?.[0]
      }}</CqTag>
    </div>
  </div>
  <div v-if="!rows.length" class="empty-inline">
    Истории участия пока нет. Рекомендации опираются на профиль и цель.
  </div>
</template>
