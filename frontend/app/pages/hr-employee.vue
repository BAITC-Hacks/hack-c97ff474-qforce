<script setup>
const route = useRoute(),
  { store, selectEmployee } = useCareer(),
  valid = ref(true);
watch(
  () => route.query.id,
  (id) => {
    valid.value = !id || store.data.employees.some((e) => e.employee_id === id);
    if (id && valid.value) selectEmployee(id);
  },
  { immediate: true },
);
</script>
<template>
  <CqProfile v-if="valid" hr /><CqState v-else kind="not-found" />
</template>
