<script setup>
import { t } from '../utils/i18n.js';
defineProps({ modelValue: { type: String, default: "" }, disabled: Boolean });
defineEmits(["update:modelValue"]);
</script>
<template>
  <input
    :value="modelValue"
    :disabled="disabled"
    class="input"
    :aria-label="t('Подразделение: точное название')"
    :placeholder="t('Подразделение: точное название')"
    maxlength="200"
    @input="$emit('update:modelValue', $event.target.value)"
  />
</template>
