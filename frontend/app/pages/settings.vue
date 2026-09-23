<script setup>
const { reset } = useCareer(),
  dialog = ref(null);
function confirmReset() {
  reset();
  dialog.value.close();
}
</script>
<template>
  <div>
    <CqHeading
      title="Настройки и приватность"
      subtitle="Развитие остаётся вашим выбором. Настройки демо не изменяют банковские системы."
    />
    <div class="grid main-aside">
      <div class="stack">
        <section class="panel">
          <h2>Личное пространство</h2>
          <div class="line-item">
            <div>
              <strong>Видимость данных коллегам</strong>
              <div class="small muted">
                Навыки и вовлечённость не публикуются
              </div>
            </div>
            <CqTag color="green">Закрыто</CqTag>
          </div>
          <div class="line-item">
            <div>
              <strong>Публичный рейтинг</strong>
              <div class="small muted">
                Не предусмотрен требованиями проекта
              </div>
            </div>
            <CqTag color="outline">Отключён</CqTag>
          </div>
          <div class="line-item">
            <div>
              <strong>Обязательное обучение</strong>
              <div class="small muted">Без игровых очков и AI-рекомендаций</div>
            </div>
            <CqIcon name="shield" />
          </div>
        </section>
        <section class="panel">
          <h2>Язык интерфейса</h2>
          <div class="actions section">
            <CqTag color="green">Русский · реализован</CqTag
            ><CqTag color="outline">Қазақша · планируется</CqTag
            ><CqTag color="outline">English · планируется</CqTag>
          </div>
          <p class="small muted section">
            Названия навыков, ролей и описания событий сохранены из датасета.
            Русские названия событий перенесены из дизайн-пакета.
          </p>
        </section>
        <section class="panel">
          <h2>Управление демо</h2>
          <p class="small muted section">
            Сброс удалит импорт, новые профили, локальные цели, план и
            смоделированные завершения. Исходный датасет восстановится.
          </p>
          <div class="section">
            <button class="btn secondary" @click="dialog.showModal()">
              Сбросить демо <CqIcon name="refresh" />
            </button>
          </div>
        </section>
      </div>
      <div class="stack">
        <CqNotice color="gold"
          ><strong>Это не система разграничения доступа.</strong> Все
          синтетические профили доступны в коде прототипа. Переключение
          «Сотрудник / HR» демонстрирует интерфейс, но не обеспечивает
          безопасность.</CqNotice
        >
        <section class="panel">
          <h2>Контур production</h2>
          <div
            v-for="[label, status] in [
              ['Корпоративная авторизация', 'Нужен backend'],
              ['Серверные роли employee / HR', 'Нужен backend'],
              ['LLM-сервис и журнал причин', 'Не подключён'],
              ['Передача данных наружу', 'Отсутствует'],
            ]"
            :key="label"
            class="line-item"
          >
            <span class="small">{{ label }}</span
            ><CqTag :color="status === 'Отсутствует' ? 'green' : 'outline'">{{
              status
            }}</CqTag>
          </div>
        </section>
        <NuxtLink to="/screens" class="btn secondary"
          >Все экраны приложения <CqIcon name="layers"
        /></NuxtLink>
      </div>
    </div>
    <dialog
      ref="dialog"
      class="panel reset-dialog"
      aria-labelledby="reset-title"
    >
      <h2 id="reset-title">Восстановить исходное демо?</h2>
      <p class="small muted section">
        Локальные профили, импорт, цели и завершения будут сброшены. Исходные
        файлы останутся без изменений.
      </p>
      <div class="actions section">
        <button class="btn secondary" autofocus @click="dialog.close()">
          Отмена</button
        ><button class="btn" @click="confirmReset">Восстановить набор</button>
      </div>
    </dialog>
  </div>
</template>
