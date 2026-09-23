<script setup>
const props=defineProps({employeeId:{type:String,required:true}});
const {t,uiError}=useLocale();
const {request}=useApi();
const busy=ref(false),credentials=ref(null),error=ref(''),created=ref(false),copied=ref(false);
async function provision(){
  if(busy.value || created.value) return;
  busy.value=true;error.value='';
  try { const response=await request('/auth/employee-accounts',{method:'POST',body:{employeeId:props.employeeId}});credentials.value=response.data;created.value=true; }
  catch(cause){error.value=uiError(cause);}
  finally{busy.value=false;}
}
async function copy(){
  try{await navigator.clipboard.writeText(`${credentials.value.username}\n${credentials.value.password}`);copied.value=true;}
  catch{error.value='Не удалось скопировать. Сохраните данные вручную.';}
}
</script>
<template>
  <div class="section">
    <button v-if="!created" class="btn ghost" type="button" :disabled="busy" @click="provision">{{ t(busy ? 'Создаём доступ…' : 'Создать вход сотрудника') }}</button>
    <CqNotice v-if="error" color="gold">{{ t(error) }}</CqNotice>
    <div v-if="credentials" class="panel section">
      <p>{{ t('Пароль показан только сейчас. Сохраните его перед закрытием. В базе хранится только хеш; существующие аккаунты не изменяются.') }}</p>
      <div class="small">{{ t('Логин') }}: <code>{{ credentials.username }}</code></div>
      <div class="small" style="overflow-wrap:anywhere">{{ t('Пароль') }}: <code>{{ credentials.password }}</code></div>
      <div class="actions section">
        <button class="btn secondary" type="button" @click="copy">{{ t(copied ? 'Скопировано' : 'Скопировать доступ') }}</button>
        <button class="btn ghost" type="button" @click="credentials=null">{{ t('Сохранил, скрыть пароль') }}</button>
      </div>
      <p class="small muted">{{ t('Для проверки пути сотрудника откройте приложение в отдельном приватном окне и войдите с этими данными.') }}</p>
    </div>
    <p v-else-if="created" class="small muted">{{ t('Доступ создан. Повторно показать пароль невозможно.') }}</p>
  </div>
</template>
