<script setup>
import { t } from '../utils/i18n.js';
const { store, logout } = useCareer();
function signOut() {
  logout();
  navigateTo("/login");
}
</script>
<template>
  <div>
    <CqHeading
      :title="t('Настройки и приватность')"
      :subtitle="t('Ваше личное пространство развития.')"
    />
    <div class="grid main-aside">
      <div class="stack">
        <section class="panel">
          <h2> {{ t("Учётная запись") }} </h2>
          <div class="line-item">
            <strong> {{ t("Роль доступа") }} </strong
            ><CqTag color="green">{{
              t(store.user?.role === "HR" ? "HR" : "Сотрудник")
            }}</CqTag>
          </div>
          <p class="small muted section"> {{ t("Доступ к данным проверяется сервером. Сотруднику доступен собственный профиль; HR — профили команды и аналитика.") }} </p>
          <button class="btn secondary section" @click="signOut"> {{ t("Выйти") }} <CqIcon name="logout" />
          </button>
        </section>
        <section class="panel">
          <h2> {{ t("Язык интерфейса") }} </h2>
          <div class="tags section"><CqLanguage /></div>
          <p class="small muted section"> {{ t("Каталог и рекомендации используют выбранный язык. При первом входе учитывается язык профиля; ваш выбор сохраняется в браузере.") }} </p>
        </section>
      </div>
      <div class="stack">
        <CqNotice
          > {{ t("Профиль, история и изменения навыков сохраняются на сервере. Перезагрузка страницы их не сбрасывает.") }} </CqNotice
        ><CqNotice color="gold"
          > {{ t("Смена пароля, самостоятельное создание профиля и изменение карьерной цели в приложении пока недоступны. Обратитесь к администратору.") }} </CqNotice
        >
      </div>
    </div>
  </div>
</template>
