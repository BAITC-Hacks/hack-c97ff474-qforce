<script setup>
import { eventTitle, formats, date } from "../utils/labels.js";
const route = useRoute(),
  {
    store,
    employee,
    selected: r,
    selectEvent,
    skillName,
    enroll,
  } = useCareer();
const valid = ref(true);
watch(
  () => route.query.id,
  (id) => {
    valid.value = !id || selectEvent(String(id));
  },
  { immediate: true },
);
const inPlan = computed(() =>
  store.state.plan.includes(
    employee.value.employee_id + ":" + r.value.event.event_id,
  ),
);
</script>
<template>
  <div v-if="valid">
    <CqHeading
      :title="eventTitle(r.event)"
      :subtitle="`${r.event.title} · ${r.event.event_id}`"
      ><NuxtLink to="/recommendations" class="btn secondary"
        >К рекомендациям <CqIcon name="back" /></NuxtLink
    ></CqHeading>
    <div class="grid main-aside">
      <div class="stack">
        <section class="panel">
          <div class="event-cover">
            <div>
              <div class="eyebrow text-primary">Развивающая активность</div>
              <h2 class="my-2.5">От обучения —<br />к конкретному навыку</h2>
              <div class="tags">
                <CqTag color="green">{{ formats[r.event.format] }}</CqTag
                ><CqTag color="outline">{{ r.event.type }}</CqTag>
              </div>
            </div>
            <div class="cover-icon"><CqIcon name="layers" /></div>
          </div>
          <h2>Об активности</h2>
          <p class="small muted section">{{ r.event.description }}</p>
          <div class="event-facts">
            <div>
              <small>Трудозатраты</small
              ><strong>{{ r.event.duration_hours }} часов</strong>
            </div>
            <div>
              <small>Формат</small
              ><strong>{{ formats[r.event.format] }}</strong>
            </div>
            <div>
              <small>Ближайший старт</small
              ><strong>{{
                r.event.format === "self_paced"
                  ? "В любой момент"
                  : date(r.nextSession)
              }}</strong>
            </div>
          </div>
          <h3>Изменение навыков</h3>
          <div v-for="s in r.changes" :key="s.skill_id" class="line-item">
            <div>
              <strong>{{ skillName(s.skill_id) }}</strong>
              <div class="small muted">
                Потолок активности: {{ s.max_level }} · прирост по правилу:
                {{ s.gain }}
              </div>
            </div>
            <div class="tags">
              <CqTag :color="s.delta ? 'green' : 'outline'"
                >{{ s.current }} → {{ s.after }}</CqTag
              ><CqTag :color="s.delta ? 'green' : 'outline'">{{
                s.delta ? "+" + s.delta : "Без роста"
              }}</CqTag>
            </div>
          </div>
          <CqNotice v-if="!r.changes.length" color="gold"
            >Эта активность не начисляет уровни навыков.</CqNotice
          >
          <div class="section">
            <CqNotice
              >Показан прирост с учётом потолка активности. Навык никогда не
              уменьшается, даже если уже выше этого потолка.</CqNotice
            >
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>Почему этот шаг?</h2>
            <CqTag color="green">3+ фактора</CqTag>
          </div>
          <CqEvidence :rec="r" />
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <h2>
            {{
              r.event.mandatory
                ? "Назначение HR"
                : r.eligible
                  ? "Шаг доступен"
                  : "Сейчас недоступно"
            }}
          </h2>
          <p class="small muted section">
            {{
              r.event.mandatory
                ? "Обязательное назначение не участвует в персональном рекомендательном блоке."
                : r.eligible
                  ? "Вы выбираете, когда продолжить развитие. Можно добавить активность в личный план."
                  : "Проверены аудитория, история, входные навыки и расписание."
            }}
          </p>
          <div class="section">
            <CqNotice v-for="reason in r.why" :key="reason" color="gold">{{
              reason
            }}</CqNotice>
          </div>
          <template v-if="r.eligible"
            ><div class="section">
              <button class="btn wide" :disabled="inPlan" @click="enroll">
                {{ inPlan ? "Уже в плане" : "Добавить в мой план" }}
                <CqIcon name="check" />
              </button>
            </div>
            <NuxtLink
              :to="{ path: '/completion', query: { id: r.event.event_id } }"
              class="btn secondary wide mt-2"
              >Симуляция результата <CqIcon name="chart" /></NuxtLink
          ></template>
          <div class="section small muted">
            Никаких баллов за обязательные процессы и сравнений с коллегами.
          </div>
        </section>
        <section class="panel">
          <h3>Входные требования</h3>
          <div
            v-for="(n, id) in r.event.prerequisites"
            :key="id"
            class="line-item"
          >
            <div>
              <strong>{{ skillName(id) }}</strong>
              <div class="small muted">
                Нужно {{ n }}, сейчас {{ r.profile.actual.levels[id] || 0 }}
              </div>
            </div>
            <CqIcon
              :name="(r.profile.actual.levels[id] || 0) >= n ? 'check' : 'lock'"
            />
          </div>
          <p
            v-if="!Object.keys(r.event.prerequisites).length"
            class="small muted section"
          >
            Дополнительных требований к навыкам нет.
          </p>
          <div class="source section">
            events.{{ r.event.event_id }}.prerequisites
          </div>
        </section>
        <section class="panel">
          <h3>Доступные сессии</h3>
          <p v-if="r.event.format === 'self_paced'" class="small muted section">
            Самостоятельное обучение: доступно без расписания.
          </p>
          <template v-else
            ><div
              v-for="d in r.event.upcoming_sessions.filter(
                (d) => d >= store.state.asOf,
              )"
              :key="d"
              class="line-item"
            >
              <span class="small">{{ date(d) }}</span
              ><CqIcon name="calendar" />
            </div>
            <p v-if="!r.nextSession" class="small muted section">
              Будущие сессии не запланированы.
            </p></template
          >
          <div class="source section">upcoming_sessions ≥ as_of_date</div>
        </section>
      </div>
    </div>
  </div>
  <CqState v-else kind="not-found" />
</template>
