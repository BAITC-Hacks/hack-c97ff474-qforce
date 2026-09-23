<script setup>
const { t } = useLocale();
import { explainRecommendation } from "../utils/explanation.js";
import { decimal } from "../utils/labels.js";
const props = defineProps({
  rec: { type: Object, required: true },
  compact: Boolean,
});
const { roleName, gradeName, skillName, activityName } = useCareer();
const explanation = computed(() =>
  explainRecommendation(props.rec, { roleName, gradeName, skillName, activityName }),
);
</script>
<template>
  <div class="rec-evidence">
    <div class="evidence-line">
      <CqIcon name="target" />
      <div>{{ explanation }}</div>
    </div>
    <p
      v-if="!compact && rec.expectedReadinessDelta != null"
      class="small muted"
    >
      {{
        t("Ожидаемый прирост соответствия навыков: {p0} п. п.", {
          p0: decimal(rec.expectedReadinessDelta),
        })
      }}
    </p>
  </div>
</template>
