<script setup>
import { t } from '../utils/i18n.js';
</script>
<template>
  <NuxtLink to="/" class="brand" :aria-label="t('QCareer — главная')"
    ><svg class="q-symbol" viewBox="0 0 40 40" aria-hidden="true">
      <circle
        cx="18"
        cy="18"
        r="12"
        fill="none"
        stroke="currentColor"
        stroke-width="5"
      />
      <path
        d="m21 21 12 12"
        stroke="#EDBD57"
        stroke-width="6"
        stroke-linecap="round"
      />
    </svg>
    <div>
      <div class="wordmark">QCareer</div>
      <div class="brand-sub"> {{ t("Ваш следующий шаг") }} </div>
    </div></NuxtLink
  >
</template>
