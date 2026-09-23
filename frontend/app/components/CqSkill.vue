<script setup>
defineProps({ gap: Object });
const { skillName } = useCareer();
</script>
<template>
  <div class="skill-row" :class="{ critical: gap.critical }">
    <div class="skill-top">
      <span
        >{{ skillName(gap.id) }}
        <CqTag v-if="gap.critical" color="gold">Критический</CqTag></span
      ><strong
        >{{ gap.current
        }}<span class="muted"> / {{ gap.required }}</span></strong
      >
    </div>
    <div
      class="bar"
      role="progressbar"
      :aria-label="skillName(gap.id)"
      :aria-valuenow="gap.current"
      aria-valuemin="0"
      :aria-valuemax="Math.max(gap.current, gap.required)"
    >
      <span
        :style="{
          width: Math.min(100, (gap.current / gap.required) * 100) + '%',
        }"
      />
    </div>
  </div>
</template>
