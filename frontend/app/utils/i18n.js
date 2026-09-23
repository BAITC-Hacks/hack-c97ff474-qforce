import { reactive } from 'vue';
import kk from './messages.kk.js';

export const localeState = reactive({ locale: 'ru', explicit: false });
export function initializeLocale() {
  try {
    const saved = localStorage.getItem('qcareer-locale');
    if (['ru', 'kk'].includes(saved)) { localeState.locale = saved; localeState.explicit = true; }
  } catch { /* Browser preference is optional. */ }
}
export function setLocale(value) {
  if (!['ru', 'kk'].includes(value)) return;
  localeState.locale = value;
  localeState.explicit = true;
  try { localStorage.setItem('qcareer-locale', value); } catch { /* In-memory choice remains available. */ }
}
export function adoptPreferredLocale(value) {
  if (!localeState.explicit && ['ru', 'kk'].includes(value)) localeState.locale = value;
}
export function t(message) {
  if (typeof message !== 'string') return message;
  const errors = {
    'Activity not found': 'Активность не найдена.',
    'Participation not found': 'Участие не найдено.',
    'Activity cannot be registered': 'Запись недоступна. Проверьте ограничения активности.',
    'Cannot complete a scheduled session before it occurs': 'Сессию можно завершить только после её проведения.',
    'No-show applies only to a scheduled session that has occurred': 'Неявку можно отметить только для прошедшей сессии.',
    'A future catalog session date is required': 'Выберите доступную дату сессии из каталога.',
    'This non-repeatable activity has already been completed; no additional skill gain can be applied': 'Активность уже завершена. Повторный прирост недоступен.',
  };
  const source = Object.hasOwn(errors, message) ? errors[message] : message;
  const key = source.replace(/\s+/g, ' ').trim();
  return localeState.locale === 'kk' && Object.hasOwn(kk, key) ? kk[key] : source;
}
