<script setup>
import { t } from '../utils/i18n.js';
</script>
<template>
  <div>
    <CqHeading
      :title="t('Загрузка данных')"
      :subtitle="t('Пример состояния загрузки интерфейса.')"
    /><CqAsync loading /><NuxtLink to="/recommendations" class="btn section"
      > {{ t("К рекомендациям") }} </NuxtLink
    >
  </div>
</template>
