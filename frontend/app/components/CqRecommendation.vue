<script setup>
import { t } from '../utils/i18n.js';
import { localeState } from "../utils/i18n.js";
import { formats } from "../utils/labels.js";
const props = defineProps({
  rec: { type: Object, required: true },
  index: { type: Number, default: 0 },
  compact: Boolean,
  readonly: Boolean,
});
const { store, skillName, activityName, notify } = useCareer();
const { request, session } = useApi();
const activity = computed(() =>
  store.activities.find((a) => a.id === props.rec.activityId),
);
const busy = ref(false),
  error = ref("");
async function feedback(rating) {
  if (props.readonly || session.user?.role === 'HR' || busy.value || !store.profile || !store.recommendations) return;
  const employeeId = store.profile.id,
    setId = store.recommendations.recommendationSetId,
    sessionVersion = session.version;
  busy.value = true;
  error.value = "";
  try {
    await request(
      `/employees/${encodeURIComponent(employeeId)}/recommendations/${encodeURIComponent(setId)}/feedback`,
      { method: "POST", body: { activityId: props.rec.activityId, rating } },
    );
    const latest = await request(
      `/employees/${encodeURIComponent(employeeId)}/recommendations/latest`,
      { query: { locale: localeState.locale } },
    );
    if (
      session.version === sessionVersion &&
      store.profile?.id === employeeId &&
      store.recommendations?.recommendationSetId === setId
    ) {
      store.recommendations = latest.data;
      notify("Обратная связь сохранена.");
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <article class="panel rec-card" :class="{ primary: index === 0 }">
    <div class="rec-top">
      <div class="rec-number">0{{ rec.rank }}</div>
      <CqTag :color="index === 0 ? 'green' : 'outline'">{{
        t('Шаг') + ' ' + rec.rank
      }}</CqTag>
    </div>
    <h3>{{ activityName(rec.activityId) }}</h3>
    <div v-if="activity" class="tags">
      <CqTag>{{ t(formats[activity.format] || activity.format) }}</CqTag
      ><CqTag>{{ activity.durationHours }} {{ t("ч") }} </CqTag>
    </div>
    <div class="tags section">
      <CqTag
        v-for="skill in rec.expectedSkillChanges"
        :key="skill.skillId"
        color="green"
        >{{ skillName(skill.skillId) }} +{{ skill.actualGain }}</CqTag
      >
    </div>
    <CqEvidence :rec="rec" :compact="compact" />
    <NuxtLink
      class="btn"
      :class="{ secondary: index !== 0 }"
      :to="{ path: '/event', query: { id: rec.activityId, ...(readonly ? { employee: store.profile.id } : {}) } }"
      > {{ t("Подробнее о шаге") }} <CqIcon name="arrow"
    /></NuxtLink>
    <div v-if="!compact && !readonly" class="actions section">
      <button class="btn ghost" :disabled="busy" @click="feedback('HELPFUL')"> {{ t("Полезно") }} </button
      ><button
        class="btn ghost"
        :disabled="busy"
        @click="feedback('NOT_HELPFUL')"
      > {{ t("Не подходит") }} </button>
    </div>
    <CqNotice v-if="error" color="red" role="alert">{{ t(error) }}</CqNotice>
  </article>
</template>
