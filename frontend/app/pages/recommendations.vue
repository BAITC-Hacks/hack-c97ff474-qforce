<script setup>
import { reasonLabel } from "../utils/labels.js";
const { store, loadEmployee, generateRecommendations, activityName } =
  useCareer();
const busy = ref(false),
  error = ref("");
onMounted(() => loadEmployee());
async function refresh() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await generateRecommendations();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div>
    <CqHeading
      title="Следующий шаг с объяснением"
      subtitle="Полезные активности с учётом навыков, доступности и истории."
      ><button
        class="btn secondary"
        :disabled="busy || store.loading || !store.profile"
        @click="refresh"
      >
        {{ busy ? "Подбираем…" : "Подобрать заново" }}
        <CqIcon name="refresh" /></button
    ></CqHeading>
    <CqAsync
      :loading="store.loading"
      :error="store.error"
      :empty="!store.profile"
      @retry="loadEmployee()"
    >
      <CqNotice v-if="error" color="red" role="alert">{{ error }}</CqNotice>
      <CqNotice v-if="store.recommendations">{{
        store.recommendations.aiUsed
          ? "Подбор с участием AI. Эффекты проверены сервером."
          : "Подбор по правилам сервера. AI не использован."
      }}</CqNotice>
      <CqNotice v-if="store.recommendations?.stale" color="gold"
        >Сохранённый подбор устарел. Обновите его с учётом актуального
        профиля.</CqNotice
      >
      <div class="grid three section">
        <CqRecommendation
          v-for="(rec, index) in store.recommendations?.recommendations || []"
          :key="rec.activityId"
          :rec="rec"
          :index="index"
        />
      </div>
      <section
        v-if="!store.recommendations?.recommendations.length"
        class="panel section"
      >
        <h2>
          {{
            store.recommendations
              ? "Подходящего шага пока нет"
              : "Подбор ещё не выполнялся"
          }}
        </h2>
        <p class="small muted section">
          {{
            store.recommendations
              ? {
                  NO_ELIGIBLE_ACTIVITIES:
                    "Каталог не содержит подходящих активностей.",
                  DATA_INCOMPLETE: "Недостаточно данных о навыках.",
                  NO_NEXT_GRADE: "Следующий грейд не задан.",
                }[store.recommendations.status] || "Список рекомендаций пуст."
              : "Нажмите «Подобрать заново», чтобы получить рекомендации."
          }}
        </p>
        <NuxtLink to="/catalog" class="btn ghost">Открыть каталог</NuxtLink>
      </section>
      <section
        v-if="store.recommendations?.diagnostics.excluded.length"
        class="panel section"
      >
        <h2>Почему не другие активности?</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Активность</th>
                <th>Ограничения</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in store.recommendations.diagnostics.excluded"
                :key="row.activityId"
              >
                <td>{{ activityName(row.activityId) }}</td>
                <td>{{ row.reasons.map(reasonLabel).join(" · ") }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </CqAsync>
  </div>
</template>
