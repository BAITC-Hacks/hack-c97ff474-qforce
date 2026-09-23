<script setup>
defineProps({ expanded: Boolean });
const { locale, languages, setLocale, t } = useLocale();
</script>

<template>
  <fieldset v-if="expanded" class="language-grid">
    <legend class="sr-only">{{ t("Язык интерфейса") }}</legend>
    <label
      v-for="item in languages"
      :key="item.code"
      class="language-option"
      :class="{ selected: locale === item.code }"
    >
      <input
        type="radio"
        name="interface-language"
        :value="item.code"
        :checked="locale === item.code"
        @change="setLocale(item.code)"
      />
      <span class="language-code" aria-hidden="true">{{ item.short }}</span>
      <span :lang="item.code">{{ item.name }}</span>
      <CqIcon v-if="locale === item.code" name="check" />
    </label>
  </fieldset>
  <label v-else class="language-switcher">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6.5h14M5 17.5h14" />
    </svg>
    <span class="sr-only">{{ t("Язык интерфейса") }}</span>
    <select
      :value="locale"
      data-testid="language-select"
      @change="setLocale($event.target.value)"
    >
      <option
        v-for="item in languages"
        :key="item.code"
        :value="item.code"
        :lang="item.code"
      >
        {{ item.name }}
      </option>
    </select>
  </label>
</template>
