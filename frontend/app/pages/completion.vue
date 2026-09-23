<script setup>
import { eventTitle, date } from "../utils/labels.js";
const route = useRoute(),
  {
    store,
    employee,
    selected: r,
    selectEvent,
    complete,
    skillName,
  } = useCareer(),
  valid = ref(true);
watch(
  () => route.query.id,
  (id) => {
    valid.value = !id || selectEvent(String(id));
  },
  { immediate: true },
);
const done = computed(
  () =>
    store.state.lastCompletion?.eventId === r.value.event.event_id &&
    store.state.lastCompletion?.employeeId === employee.value.employee_id,
);
const changes = computed(() =>
  done.value ? store.state.lastCompletion.changes : r.value.changes,
);
const after = computed(() => {
  const p = { ...r.value.profile.actual.levels };
  for (const s of r.value.changes) p[s.skill_id] = s.after;
  const g = r.value.profile.gaps;
  return g.length
    ? Math.round(
        (100 *
          g.reduce((n, g) => n + Math.min((p[g.id] || 0) / g.required, 1), 0)) /
          g.length,
      )
    : 100;
});
</script>
<template>
  <div v-if="valid">
    <CqHeading
      :title="done ? 'Демо-выполнение сохранено' : 'Как изменится ваш прогресс'"
      :subtitle="`Симуляция результата · ${eventTitle(r.event)}`"
      ><NuxtLink
        :to="{ path: '/event', query: { id: r.event.event_id } }"
        class="btn secondary"
        >К активности <CqIcon name="back" /></NuxtLink></CqHeading
    ><CqNotice :color="done ? '' : 'gold'"
      ><template v-if="done"
        >Результат сохранён только в этом браузере. Официальные данные и грейд
        сотрудника не изменены.</template
      ><template v-else
        ><strong>Это прогноз, а не подтверждённое выполнение.</strong> Дата
        сценария:
        {{
          date(
            r.event.format === "self_paced" ? store.state.asOf : r.nextSession,
          )
        }}. При подтверждении дата демо будет перенесена на день
        сессии.</template
      ></CqNotice
    >
    <div class="grid main-aside section">
      <section class="panel">
        <div class="success-icon">
          <CqIcon :name="done ? 'check' : 'chart'" />
        </div>
        <h2>
          {{
            done ? "Ещё один шаг в вашем пути" : "Развитие становится видимым"
          }}
        </h2>
        <p class="small muted section">
          {{
            done
              ? "Откройте профиль, чтобы увидеть обновлённые навыки. Повторное начисление этой же записи заблокировано."
              : "После завершения пересчитываются только навыки, указанные у активности."
          }}
        </p>
        <div class="delta">
          <div>
            <small class="muted">До активности</small>
            <div>
              <strong
                >{{
                  done ? store.state.lastCompletion.before : r.profile.progress
                }}%</strong
              >
            </div>
          </div>
          <CqIcon name="arrow" />
          <div class="after">
            <small>После активности</small>
            <div>
              <strong
                >{{ done ? store.state.lastCompletion.after : after }}%</strong
              >
            </div>
          </div>
        </div>
        <div v-for="s in changes" :key="s.skill_id" class="line-item">
          <strong>{{ skillName(s.skill_id) }}</strong>
          <div class="tags">
            <CqTag color="green">{{ s.current }} → {{ s.after }}</CqTag
            ><CqTag color="outline">Потолок {{ s.max_level }}</CqTag>
          </div>
        </div>
        <div class="section">
          <CqNotice
            >Это покрытие требований по навыкам. Система не присваивает новый
            грейд и не обещает повышение.</CqNotice
          >
        </div>
      </section>
      <div class="stack">
        <section class="panel">
          <h2>Подтверждение в демо</h2>
          <div
            v-for="(step, i) in [
              [
                'Одна запись участия',
                'Новая запись или обновление начатой активности со статусом completed.',
              ],
              [
                'Пересчёт по правилам',
                'gain, max_level, дата оценки и защита от повтора.',
              ],
              [
                'Новый следующий шаг',
                'Рекомендации обновятся после изменения навыков.',
              ],
            ]"
            :key="i"
            class="timeline-step"
            :class="{ section: i === 0 }"
          >
            <div class="num">{{ i + 1 }}</div>
            <div>
              <h3>{{ step[0] }}</h3>
              <p>{{ step[1] }}</p>
            </div>
          </div>
          <NuxtLink v-if="done" to="/dashboard" class="btn wide"
            >Вернуться к развитию <CqIcon name="arrow" /></NuxtLink
          ><button v-else-if="r.eligible" class="btn wide" @click="complete">
            Подтвердить в демо <CqIcon name="check" /></button
          ><CqNotice v-else color="gold"
            >Подтверждение недоступно: активность не прошла проверки.</CqNotice
          >
        </section>
        <div class="source">
          Демо изменяет localStorage, а не исходный JSON. Сброс доступен в
          настройках.
        </div>
      </div>
    </div>
  </div>
  <CqState v-else kind="not-found" />
</template>
