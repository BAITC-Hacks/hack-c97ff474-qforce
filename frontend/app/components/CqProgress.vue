<script setup>
defineProps({ profile: Object });
const { gradeName } = useCareer();
const circ = 2 * Math.PI * 57;
</script>
<template>
  <svg
    viewBox="0 0 330 175"
    role="img"
    :aria-label="`Соответствие навыков: ${profile.readinessPercent === null ? 'нет данных' : profile.readinessPercent + ' процентов'}. Следующий грейд: ${gradeName(profile.nextGradeId)}`"
  >
    <path
      d="M0 137C49 137 26 41 81 41S126 140 165 140"
      stroke="#B9D9BD"
      stroke-opacity=".35"
      fill="none"
      stroke-width="2"
      stroke-dasharray="5 6"
    />
    <circle cx="30" cy="125" r="7" fill="#BBD7B0" />
    <circle cx="81" cy="41" r="7" fill="#EDBD57" />
    <circle cx="228" cy="84" r="68" fill="#FFFFFF05" />
    <circle
      cx="228"
      cy="84"
      r="57"
      fill="none"
      stroke="#FFFFFF16"
      stroke-width="7"
    />
    <circle
      cx="228"
      cy="84"
      r="57"
      fill="none"
      stroke="#ECC563"
      stroke-width="7"
      stroke-linecap="round"
      :stroke-dasharray="`${(circ * profile.readinessPercent) / 100} ${circ}`"
      transform="rotate(-90 228 84)"
    />
    <text x="228" y="90" text-anchor="middle" class="ring-value">
      {{
        profile.readinessPercent === null
          ? "—"
          : Number(profile.readinessPercent.toFixed(1)) + "%"
      }}
    </text>
    <text x="228" y="110" text-anchor="middle" fill="#BDDBCE" font-size="10">
      соответствие навыков
    </text>
    <text x="27" y="153" fill="#BFDBCE" font-size="11">сейчас</text>
    <text x="228" y="174" text-anchor="middle" fill="#E2ECCB" font-size="11">
      Цель: {{ gradeName(profile.nextGradeId) }}
    </text>
  </svg>
</template>
