<script setup>
import { t } from '../utils/i18n.js';
defineProps({ gap: { type: Object, required: true } });
const { skillName } = useCareer();
</script>
<template>
  <div class="skill-row" :class="{ critical: gap.critical }">
    <div class="skill-top">
      <span
        >{{ skillName(gap.skillId) }}
        <CqTag v-if="gap.critical" color="gold"> {{ t("Критический") }} </CqTag></span
      ><strong
        >{{ gap.currentLevel ?? "—"
        }}<span class="muted"> / {{ gap.requiredLevel }}</span></strong
      >
    </div>
    <div
      v-if="gap.currentLevel !== null && gap.requiredLevel > 0"
      class="bar"
      role="progressbar"
      :aria-label="skillName(gap.skillId)"
      :aria-valuenow="gap.currentLevel"
      aria-valuemin="0"
      :aria-valuemax="Math.max(gap.currentLevel, gap.requiredLevel)"
    >
      <span
        :style="{
          width:
            Math.min(100, (gap.currentLevel / gap.requiredLevel) * 100) + '%',
        }"
      />
    </div>
    <p v-else-if="gap.currentLevel === null" class="small muted"> {{ t("Текущий уровень неизвестен") }} </p>
  </div>
</template>
