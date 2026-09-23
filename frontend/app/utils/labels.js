import { localeState, t } from './i18n.js';
export const eventTitle = (value) => value?.title || value?.id || t("Активность");
export const formats = {
  online: "Онлайн",
  offline: "Очно",
  self_paced: "В своём темпе",
};
export const statuses = {
  registered: ["Записан", "outline"],
  completed: ["Завершено", "green"],
  in_progress: ["В процессе", "gold"],
  dropped: ["Прервано", "red"],
  no_show: ["Неявка", "gold"],
  declined: ["Отказ", "outline"],
  overdue: ["Просрочено", "red"],
};
export const date = (value) => {
  if (!value) return t('Не указано');
  const parsed = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
  if (localeState.locale === 'kk') {
    // Some Chromium/ICU builds render Kazakh short months as "M09".
    const months = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'];
    return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()} ж.`;
  }
  return parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const decimal = (value) => Number.isFinite(value)
  ? new Intl.NumberFormat(localeState.locale === 'kk' ? 'kk-KZ' : 'ru-RU', { maximumFractionDigits: 1 }).format(value)
  : t('Нет данных');
export const initials = (person) =>
  (person?.fullName || person?.full_name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
export const percent = (value) =>
  value == null ? t("Нет данных") : `${Number(value.toFixed(1))}%`;
export const trajectoryStatus = {
  READY: "Требования по навыкам закрыты",
  IN_PROGRESS: "Есть навыки для развития",
  DATA_INCOMPLETE: "Недостаточно данных о навыках",
  NO_NEXT_GRADE: "Следующий грейд не задан",
  NO_REQUIREMENTS: "Требования не заданы",
};
export const reasons = {
  MANDATORY_ACTIVITY: "Обязательное обучение не входит в рекомендации",
  NO_RELEVANT_GAIN: "Нет прироста для следующего грейда",
  NO_USEFUL_EFFECT: "Уровень навыков не повышается",
  NO_RELEVANT_GAP_EFFECT: "Не сокращает текущие разрывы до следующего грейда",
  NO_NEXT_GRADE: "Следующий грейд не задан",
  ROLE_MISMATCH: "Ограничение по роли",
  GRADE_MISMATCH: "Ограничение по грейду",
  ALREADY_COMPLETED: "Активность уже завершена",
  NO_UPCOMING_SESSION: "Нет будущих сессий",
  PREREQUISITES_NOT_MET: "Не выполнены входные требования",
  ALREADY_ACTIVE: "Участие уже начато",
  DATA_INCOMPLETE: "Недостаточно данных о навыках",
};
export const reasonLabel = (code) => t(reasons[code] || code);
