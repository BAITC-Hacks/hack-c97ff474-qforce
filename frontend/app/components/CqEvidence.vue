<script setup>
import { t } from '../utils/i18n.js';
import { decimal } from '../utils/labels.js';
defineProps({ rec: { type: Object, required: true }, compact: Boolean });
</script>
<template>
  <div class="rec-evidence">
    <div class="evidence-line">
      <CqIcon name="target" />
      <div>{{ rec.explanation }}</div>
    </div>
    <p
      v-if="!compact && rec.expectedReadinessDelta !== null"
      class="small muted"
    > {{ t("Ожидаемый прирост соответствия навыков:") }} {{ decimal(rec.expectedReadinessDelta) }} {{ t("п. п.") }} </p>
  </div>
</template>
