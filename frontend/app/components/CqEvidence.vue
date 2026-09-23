<script setup>
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
    >
      Ожидаемый прирост соответствия навыков:
      {{ rec.expectedReadinessDelta }} п. п.
    </p>
  </div>
</template>
