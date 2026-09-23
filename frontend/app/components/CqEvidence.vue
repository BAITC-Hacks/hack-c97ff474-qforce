<script setup>
import { formats } from "../utils/labels.js";
const props = defineProps({ rec: Object, compact: Boolean });
const { employee, skillName } = useCareer();
const first = computed(() => props.rec.changes.find((s) => s.closure > 0));
</script>
<template>
  <div class="rec-evidence">
    <div class="evidence-line">
      <CqIcon name="target" />
      <div>
        <strong>Цель:</strong> {{ rec.profile.goal.target_role }} ·
        {{ rec.profile.goal.target_grade }}. Текущий грейд —
        {{ employee.grade }}.
      </div>
    </div>
    <div class="evidence-line">
      <CqIcon name="layers" />
      <div>
        <strong>Разрыв:</strong>
        <template v-if="first"
          >{{ skillName(first.skill_id) }} {{ first.current }} →
          {{ first.after }}; требуется {{ first.required }}.
          {{ first.critical ? "Критический навык." : "" }}</template
        ><template v-else>Нет прироста к цели.</template>
      </div>
    </div>
    <div class="evidence-line">
      <CqIcon name="clock" />
      <div>
        <strong>История:</strong> {{ rec.completedFormat }} завершений в формате
        «{{ formats[rec.event.format] }}»; {{ rec.bad }} пропусков / отказов /
        прерываний этой активности.
      </div>
    </div>
    <div v-if="!compact" class="source">
      employees.{{ employee.employee_id }} · {{ rec.event.event_id }} ·
      role_profiles · activity_history
    </div>
  </div>
</template>
