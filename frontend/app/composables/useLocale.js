import {
  locale,
  languages,
  setLocale,
  initLocale,
  translate,
  number,
  unit,
  message,
  catalogText,
  uiError,
  localeState,
  initializeLocale,
  adoptPreferredLocale,
  apiLocale,
} from "../utils/i18n.js";

export function useLocale() {
  return {
    locale,
    languages,
    setLocale,
    initLocale,
    t: translate,
    n: number,
    unit,
    message,
    catalogText,
    uiError,
    localeState,
    initializeLocale,
    adoptPreferredLocale,
    apiLocale,
  };
}
