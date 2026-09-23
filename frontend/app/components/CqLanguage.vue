<script setup>
const { localeState, setLocale, t } = useLocale();
</script>
<template>
  <label class="small">
    <span class="sr-only">{{ t('Язык интерфейса') }}</span>
    <select class="select" :aria-label="t('Язык интерфейса')" :value="localeState.locale" @change="setLocale($event.target.value)">
      <option value="ru">Русский</option>
      <option value="kk">Қазақша</option>
    </select>
  </label>
</template>
