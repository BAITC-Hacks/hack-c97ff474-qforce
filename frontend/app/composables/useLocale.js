import { localeState, setLocale, t } from '../utils/i18n.js';
export function useLocale() { return { localeState, setLocale, t }; }
