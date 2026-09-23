<script setup>
defineProps({ modelValue: String });
defineEmits(["update:modelValue"]);
const { store } = useCareer();
const departments = computed(() => [
  ...new Set(store.data.employees.map((e) => e.department)),
]);
</script>
<template>
  <select
    :value="modelValue"
    class="select"
    aria-label="Подразделение"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <option value="all">Все подразделения</option>
    <option v-for="d in departments" :key="d">{{ d }}</option>
  </select>
</template>
