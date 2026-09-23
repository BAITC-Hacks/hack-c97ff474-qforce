<script setup>
defineProps({ modelValue: { type: String, default: "" }, disabled: Boolean });
defineEmits(["update:modelValue"]);
</script>
<template>
  <input
    :value="modelValue"
    :disabled="disabled"
    class="input"
    aria-label="Подразделение: точное название"
    placeholder="Подразделение: точное название"
    maxlength="200"
    @input="$emit('update:modelValue', $event.target.value)"
  />
</template>
