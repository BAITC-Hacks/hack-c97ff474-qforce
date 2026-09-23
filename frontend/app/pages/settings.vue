<script setup>
const { store, logout } = useCareer();
function signOut() {
  logout();
  navigateTo("/login");
}
</script>
<template>
  <div>
    <CqHeading
      title="Настройки и приватность"
      subtitle="Ваше личное пространство развития."
    />
    <div class="grid main-aside">
      <div class="stack">
        <section class="panel">
          <h2>Учётная запись</h2>
          <div class="line-item">
            <strong>Роль доступа</strong
            ><CqTag color="green">{{
              store.user?.role === "HR" ? "HR" : "Сотрудник"
            }}</CqTag>
          </div>
          <p class="small muted section">
            Доступ к данным проверяется сервером. Сотруднику доступен
            собственный профиль; HR — профили команды и аналитика.
          </p>
          <button class="btn secondary section" @click="signOut">
            Выйти <CqIcon name="logout" />
          </button>
        </section>
        <section class="panel">
          <h2>Язык интерфейса</h2>
          <div class="tags section"><CqTag color="green">Русский</CqTag></div>
          <p class="small muted section">
            Каталог использует русский перевод при его наличии, иначе исходный
            текст.
          </p>
        </section>
      </div>
      <div class="stack">
        <CqNotice
          >Профиль, история и изменения навыков сохраняются на сервере.
          Перезагрузка страницы их не сбрасывает.</CqNotice
        ><CqNotice color="gold"
          >Смена пароля, самостоятельное создание профиля и изменение карьерной
          цели в приложении пока недоступны. Обратитесь к
          администратору.</CqNotice
        >
      </div>
    </div>
  </div>
</template>
