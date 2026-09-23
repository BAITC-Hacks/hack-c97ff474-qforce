<script setup>
import { reasonLabel } from '../utils/labels.js';
defineProps({ hr: Boolean });
const { store, generateRecommendations, activityName } = useCareer();
const { t, uiError } = useLocale();
const busy = ref(false), error = ref('');
async function refresh() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try { await generateRecommendations(); } catch (cause) { error.value = uiError(cause); } finally { busy.value = false; }
}
</script>
<template>
  <section class="section" data-testid="recommendations-block">
    <div class="panel-head">
      <h2>{{ t('Следующий шаг с объяснением') }}</h2>
      <button class="btn secondary" :disabled="busy || store.loading || store.blockLoading.recommendations || !store.profile" @click="refresh">{{ t(busy ? 'Подбираем…' : 'Подобрать заново') }} <CqIcon name="refresh" /></button>
    </div>
    <CqNotice v-if="hr">{{ t('Подбор для выбранного сотрудника. Запись и оценка рекомендаций доступны только самому сотруднику.') }}</CqNotice>
    <CqDataWarnings :blocks="['recommendations', 'catalogs']" />
    <CqNotice v-if="error" color="red" role="alert">{{ t(error) }}</CqNotice>
    <p v-if="store.blockLoading.recommendations" role="status">{{ t('Загружаем рекомендации…') }}</p>
    <template v-else-if="!store.blockErrors.recommendations">
      <CqNotice v-if="store.recommendations">{{ t(store.recommendations.aiUsed ? 'Подбор с участием AI. Эффекты проверены сервером.' : 'Подбор по правилам сервера. AI не использован.') }}</CqNotice>
      <CqNotice v-if="store.recommendations?.recommendations.length > 1">{{ t('Ожидаемый прогресс рассчитан для шагов по порядку. Участие остаётся добровольным.') }}</CqNotice>
      <CqNotice v-if="store.recommendations?.stale" color="gold">{{ t('Сохранённый подбор устарел. Обновите его с учётом актуального профиля.') }}</CqNotice>
      <div class="grid three section"><CqRecommendation v-for="(rec, index) in store.recommendations?.recommendations || []" :key="rec.activityId" :rec="rec" :index="index" :readonly="hr" /></div>
      <section v-if="!store.recommendations?.recommendations.length" class="panel section">
        <h3>{{ t(store.recommendations ? 'Подходящего шага пока нет' : 'Подбор ещё не выполнялся') }}</h3>
        <p class="small muted section">{{ t(store.recommendations ? ({ NO_ELIGIBLE_ACTIVITIES: 'Каталог не содержит подходящих активностей.', DATA_INCOMPLETE: 'Недостаточно данных о навыках.', NO_NEXT_GRADE: 'Следующий грейд не задан.' }[store.recommendations.status] || 'Список рекомендаций пуст.') : 'Нажмите «Подобрать заново», чтобы получить рекомендации.') }}</p>
        <NuxtLink v-if="!hr" to="/catalog" class="btn ghost">{{ t('Открыть каталог') }}</NuxtLink>
        <CqRecovery v-if="store.recommendations && ['NO_ELIGIBLE_ACTIVITIES', 'DATA_INCOMPLETE'].includes(store.recommendations.status)" :hr="hr" />
      </section>
      <section v-if="store.recommendations?.diagnostics?.excluded?.length" class="panel section">
        <h3>{{ t('Почему не другие активности?') }}</h3>
        <div class="table-wrap"><table><thead><tr><th>{{ t('Активность') }}</th><th>{{ t('Ограничения') }}</th></tr></thead>
          <tbody><tr v-for="row in store.recommendations.diagnostics.excluded" :key="row.activityId"><td>{{ activityName(row.activityId) }}</td><td>{{ row.reasons.map(reason => t(reasonLabel(reason))).join(' · ') }}</td></tr></tbody>
        </table></div>
      </section>
    </template>
  </section>
</template>
