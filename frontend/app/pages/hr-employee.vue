<script setup>
const route = useRoute();
const employeeId = computed(() =>
  typeof route.query.id === "string" ? route.query.id : "",
);
</script>
<template>
  <CqProfile v-if="employeeId" :key="employeeId" :employee-id="employeeId" hr />
  <CqState v-else kind="not-found" />
</template>
