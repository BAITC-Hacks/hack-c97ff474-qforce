<script setup>
import { eventTitle } from "../utils/labels.js";
const { store, employee, current, E, notify } = useCareer(),
  refreshing = ref(false);
const blocked = computed(() =>
  store.data.events
    .map((v) =>
      E.inspect(
        store.data,
        employee.value,
        v,
        store.state.asOf,
        store.state.goals[employee.value.employee_id],
      ),
    )
    .filter(
      (r) =>
        !r.eligible &&
        !r.event.mandatory &&
        r.event.target_roles.includes(employee.value.role),
    )
    .slice(0, 4),
);
function refresh() {
  refreshing.value = true;
  requestAnimationFrame(() => {
    refreshing.value = false;
    notify("Подбор обновлён прозрачными правилами. LLM в демо не подключён.");
  });
}
</script>
<template>
  <div>
    <CqHeading
      title="Следующий шаг с объяснением"
      subtitle="Не «самый слабый навык», а полезная активность с учётом цели, доступности и истории."
      ><button class="btn secondary" :disabled="refreshing" @click="refresh">
        Пересчитать <CqIcon name="refresh" /></button></CqHeading
    ><CqNotice
      ><strong>Демонстрационная логика, не подключённый AI.</strong>
      Рекомендации рассчитываются прозрачными правилами с учётом цели,
      критических разрывов, доступности и истории.</CqNotice
    >
    <div class="filters">
      <CqTag color="green"
        >{{ employee.grade }} → {{ current.p.goal.target_grade }}</CqTag
      ><CqTag color="outline">Учитываются критические навыки</CqTag
      ><CqTag color="outline">Обязательные события исключены</CqTag
      ><CqTag color="outline">До 3 рекомендаций</CqTag>
    </div>
    <div class="grid three">
      <CqRecommendation
        v-for="(r, i) in current.recs"
        :key="r.event.event_id"
        :rec="r"
        :index="i"
      />
      <section v-if="!current.recs.length" class="panel">
        Нет допустимых активностей.
        <NuxtLink to="/no-recommendations" class="btn ghost"
          >Почему так? <CqIcon name="arrow"
        /></NuxtLink>
      </section>
    </div>
    <section class="panel section">
      <div class="panel-head">
        <h2>Почему не другие активности?</h2>
        <CqTag color="outline">Проверяемые ограничения</CqTag>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Активность</th>
              <th>Почему исключена</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in blocked" :key="r.event.event_id">
              <td>
                <strong>{{ eventTitle(r.event) }}</strong>
                <div class="sub">{{ r.event.event_id }}</div>
              </td>
              <td>{{ r.why.slice(0, 2).join(" · ") }}</td>
              <td>
                <NuxtLink
                  :to="{ path: '/event', query: { id: r.event.event_id } }"
                  class="btn ghost"
                  >Проверить</NuxtLink
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <div class="section">
      <CqNotice color="gold"
        >Пропуски не означают отсутствие мотивации. Они лишь снижают приоритет
        повторного предложения этой активности; причина пропуска в данных не
        указана.</CqNotice
      >
    </div>
  </div>
</template>
