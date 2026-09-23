<script setup>
const { t } = useLocale();
import { date, statuses, percent } from "../utils/labels.js";
const props = defineProps({
  history: { type: Array, default: () => [] },
  limit: { type: Number, default: 4 },
  hr: Boolean,
});
const { activityName } = useCareer();
const rows = computed(() =>
  props.history
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, props.limit),
);
</script>
<template>
  <div v-for="row in rows" :key="row.id" class="activity-line">
    <span class="mini-icon"><CqIcon name="book" /></span>
    <div>
      <strong v-if="hr">{{ t(activityName(row.activityId)) }}</strong
      ><NuxtLink
        v-else
        class="activity-title"
        :to="{ path: '/event', query: { id: row.activityId } }"
        >{{ t(activityName(row.activityId)) }}</NuxtLink
      >
      <div class="activity-date">
        {{ t(date(row.date)) }} · {{ percent(row.completionPct) }}
      </div>
    </div>
    <CqTag :color="statuses[row.status]?.[1]">{{
      t(statuses[row.status]?.[0] || row.status)
    }}</CqTag>
  </div>
  <div v-if="!rows.length" class="empty-inline">
    {{ t("Истории участия пока нет.") }}
  </div>
</template>
