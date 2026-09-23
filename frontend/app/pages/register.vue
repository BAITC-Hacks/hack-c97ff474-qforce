<script setup>
const { t } = useLocale();
definePageMeta({ layout: "auth" });
</script>
<template>
  <div>
    <div class="eyebrow text-primary">{{ t("Доступ к Career Quest") }}</div>
    <h2>{{ t("Обратитесь к администратору") }}</h2>
    <p>
      {{
        t(
          "Самостоятельная регистрация пока недоступна. HR может импортировать профиль сотрудника; учётную запись создаёт администратор.",
        )
      }}
    </p>
    <NuxtLink to="/login" class="btn section"
      >{{ t("Вернуться ко входу") }}<CqIcon name="arrow"
    /></NuxtLink>
  </div>
</template>
