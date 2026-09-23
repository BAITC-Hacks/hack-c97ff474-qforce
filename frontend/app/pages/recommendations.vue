<script setup>
import {  } from "../utils/i18n.js";
const { store, loadEmployee } = useCareer();
onMounted(() => loadEmployee());
</script>
<template>
  <CqAsync :loading="store.loading" :error="store.error" :empty="!store.profile" @retry="loadEmployee()">
    <CqRecommendations />
  </CqAsync>
</template>
