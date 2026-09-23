<script setup>
const { t, uiError } = useLocale();
const { request } = useApi();
const rows = ref([]), status = ref('OPEN'), page = ref(1), total = ref(0), loading = ref(false), error = ref(''), busy = ref('');
const answers = reactive({});
let generation = 0;
async function load() {
  const current = ++generation; loading.value = true; error.value = '';
  try {
    const response = await request('/hr/development-requests', {query: {status: status.value, page: page.value, pageSize: 20}});
    if (current === generation) { rows.value = response.data; total.value = response.meta.total; }
  } catch (cause) { if (current === generation) error.value = uiError(cause); }
  finally { if (current === generation) loading.value = false; }
}
async function resolveRequest(row) {
  if (busy.value || !answers[row.id]?.trim()) return;
  busy.value = row.id; error.value = '';
  try { await request(`/hr/development-requests/${encodeURIComponent(row.id)}/resolve`, {method: 'POST', body: {resolution: answers[row.id].trim(), expectedVersion: row.version}}); delete answers[row.id]; await load(); }
  catch (cause) { error.value = uiError(cause); }
  finally { busy.value = ''; }
}
function filter() { page.value = 1; load(); }
function turn(delta) { page.value += delta; load(); }
onMounted(load);
onBeforeUnmount(() => { ++generation; });
</script>
<template>
  <div>
    <CqHeading :title="t('Заявки на развитие')" :subtitle="t('Помогите сотрудникам, которым не хватает подходящего обучения в каталоге.')" />
    <div class="panel actions"><label>{{ t('Статус') }} <select v-model="status" @change="filter"><option value="OPEN">{{ t('Открытые заявки') }}</option><option value="RESOLVED">{{ t('Заявки с ответом') }}</option></select></label><button class="btn ghost" :disabled="loading" @click="load">{{ t('Обновить') }}</button></div>
    <CqNotice v-if="error" color="red" role="alert">{{ t(error) }}</CqNotice>
    <p v-if="loading" role="status">{{ t('Загрузка…') }}</p>
    <CqNotice v-else-if="!rows.length && !error">{{ t('Заявок пока нет.') }}</CqNotice>
    <section v-for="row in rows" :key="row.id" class="panel section" data-testid="development-request">
      <h2><NuxtLink :to="{path: '/hr-employee', query: {id: row.employeeId}}">{{ row.employee?.fullName || row.employeeId }}</NuxtLink></h2>
      <p>{{ row.employeeId }} · {{ row.employee?.roleId }} · {{ row.employee?.gradeId }}</p>
      <p>{{ t('Дата среза') }}: {{ row.snapshot.asOfDate }}</p>
      <ul class="section"><li v-for="gap in row.snapshot.gaps || []" :key="gap.skillId">{{ gap.skillId }}: {{ gap.currentLevel ?? '—' }} → {{ gap.requiredLevel }}</li></ul>
      <p v-if="row.resolution" class="section"><strong>{{ t('Ответ HR') }}:</strong> {{ row.resolution }}</p>
      <form v-if="row.status === 'OPEN'" class="section" @submit.prevent="resolveRequest(row)">
        <label class="field">{{ t('Ответ сотруднику') }}<textarea v-model="answers[row.id]" required maxlength="2000" rows="3" :placeholder="t('Укажите подходящее обучение или следующий согласованный шаг.')" /></label>
        <button class="btn" :disabled="!!busy || !answers[row.id]?.trim()">{{ t(busy === row.id ? 'Сохраняем…' : 'Сохранить ответ') }}</button>
      </form>
    </section>
    <div class="actions section"><button class="btn ghost" :disabled="loading || page <= 1" @click="turn(-1)">{{ t('Назад') }}</button><span>{{ page }} / {{ Math.max(1, Math.ceil(total / 20)) }}</span><button class="btn ghost" :disabled="loading || page * 20 >= total" @click="turn(1)">{{ t('Далее') }}</button></div>
  </div>
</template>
