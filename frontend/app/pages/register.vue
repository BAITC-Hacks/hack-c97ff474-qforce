<script setup>
definePageMeta({ layout: "auth" });
</script>
<template>
  <div>
    <div class="eyebrow text-primary">Доступ к Career Quest</div>
    <h2>Обратитесь к администратору</h2>
    <p>
      Самостоятельная регистрация пока недоступна. HR может импортировать
      профиль сотрудника; учётную запись создаёт администратор.
    </p>
    <NuxtLink to="/login" class="btn section"
      >Вернуться ко входу <CqIcon name="arrow"
    /></NuxtLink>
  </div>
</template>
