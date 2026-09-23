<script setup>
import { t } from '../utils/i18n.js';
defineProps({ loading: Boolean, error: String, empty: Boolean });
defineEmits(["retry"]);
</script>
<template>
  <section
    v-if="loading"
    class="panel state-panel"
    role="status"
    aria-live="polite"
  > {{ t("Загружаем данные…") }} </section>
  <section v-else-if="error" class="panel" role="alert">
    <CqNotice color="red">{{ t(error) }}</CqNotice>
    <button class="btn secondary section" @click="$emit('retry')"> {{ t("Повторить запрос") }} <CqIcon name="refresh" />
    </button>
  </section>
  <section v-else-if="empty" class="panel empty-inline"> {{ t("Данных пока нет.") }} </section>
  <slot v-else />
</template>
