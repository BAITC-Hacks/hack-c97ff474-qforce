<script setup>
import { eventTitle, formats, date } from "../utils/labels.js";
defineProps({
  rec: Object,
  index: { type: Number, default: 0 },
  compact: Boolean,
});
const { store, skillName } = useCareer();
</script>
<template>
  <article class="panel rec-card" :class="{ primary: index === 0 }">
    <div class="rec-top">
      <div class="rec-number">0{{ index + 1 }}</div>
      <CqTag :color="index === 0 ? 'green' : 'outline'">{{
        index === 0 ? "Приоритетный шаг" : "Альтернатива"
      }}</CqTag>
    </div>
    <h3>{{ eventTitle(rec.event) }}</h3>
    <div class="tags">
      <CqTag>{{ formats[rec.event.format] }}</CqTag
      ><CqTag>{{ rec.event.duration_hours }} ч</CqTag
      ><CqTag color="green">{{
        rec.resume ? "Продолжить начатое" : "Добровольно"
      }}</CqTag>
    </div>
    <p class="desc">
      {{
        rec.nextSession === store.state.asOf &&
        rec.event.format === "self_paced"
          ? "Можно начать сегодня"
          : "Ближайшая сессия: " + date(rec.nextSession)
      }}
    </p>
    <div class="tags">
      <CqTag
        v-for="s in rec.changes.filter((s) => s.closure > 0).slice(0, 2)"
        :key="s.skill_id"
        color="green"
        >{{ skillName(s.skill_id) }} +{{ s.delta }}</CqTag
      >
    </div>
    <CqEvidence :rec="rec" :compact="compact" /><NuxtLink
      class="btn"
      :class="{ secondary: index !== 0 }"
      :to="{ path: '/event', query: { id: rec.event.event_id } }"
      >Подробнее о шаге <CqIcon name="arrow"
    /></NuxtLink>
  </article>
</template>
