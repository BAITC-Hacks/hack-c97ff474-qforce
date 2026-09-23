<script setup>
defineProps({ hr: Boolean });
const { store, skillName, activityName } = useCareer();
const { request } = useApi();
const { t, uiError } = useLocale();
const data = ref(null), error = ref(''), busy = ref(false);
let generation = 0;
async function load() {
  const current = ++generation, id = store.profile?.id;
  data.value = null; error.value = '';
  if (!id) return;
  try {
    const result = await request(`/employees/${encodeURIComponent(id)}/development-request`);
    if (current === generation && store.profile?.id === id) data.value = result.data;
  } catch (cause) { if (current === generation) error.value = uiError(cause); }
}
async function open() {
  if (busy.value || !store.profile) return;
  const id = store.profile.id, current = generation;
  busy.value = true; error.value = '';
  try {
    const result = await request(`/employees/${encodeURIComponent(id)}/development-request`, {method: 'POST', body: {expectedVersion: data.value?.request?.version ?? null}});
    if (current === generation && store.profile?.id === id && data.value) data.value.request = result.data;
  } catch (cause) { if (current === generation) error.value = uiError(cause); }
  finally { busy.value = false; }
}
watch(() => [store.profile, store.recommendations?.recommendationSetId], load, {immediate: true});
onBeforeUnmount(() => { ++generation; });
</script>
<template>
  <div class="section" data-testid="development-recovery">
    <CqNotice>{{ t('Если каталог исчерпан, можно запросить помощь HR. Заявка не начисляет навыки и не заменяет обучение.') }}</CqNotice>
    <template v-if="data">
      <p v-if="data.guidance.activeActivityIds.length" class="section">
        {{ t('Уже начатое обучение') }}: {{ data.guidance.activeActivityIds.map(activityName).join(' · ') }}
        <NuxtLink v-if="!hr" to="/activities" class="btn ghost">{{ t('Продолжить обучение') }}</NuxtLink>
      </p>
      <ul v-if="data.guidance.gaps.length" class="section">
        <li v-for="gap in data.guidance.gaps" :key="gap.skillId">{{ skillName(gap.skillId) }}: {{ gap.currentLevel ?? '—' }} → {{ gap.requiredLevel }}</li>
      </ul>
      <CqNotice v-if="data.request?.status === 'OPEN'" color="green">{{ t('Заявка сохранена в очереди HR.') }}</CqNotice>
      <div v-if="data.request?.resolution" class="panel section"><strong>{{ t('Ответ HR') }}</strong><p>{{ data.request.resolution }}</p></div>
      <button v-if="data.guidance.nextGradeId && data.guidance.gaps.length && data.request?.status !== 'OPEN'" class="btn secondary section" :disabled="busy" @click="open">{{ t(busy ? 'Сохраняем…' : 'Запросить помощь HR') }}</button>
      <NuxtLink v-if="hr" to="/hr-requests" class="btn ghost section">{{ t('Заявки на развитие') }}</NuxtLink>
    </template>
    <CqNotice v-if="error" color="red" role="alert">{{ t(error) }} <button class="btn ghost" @click="load">{{ t('Повторить') }}</button></CqNotice>
  </div>
</template>
