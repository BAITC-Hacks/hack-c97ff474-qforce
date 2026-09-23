import { readonly, ref } from "vue";
import messages from "../locales/messages.json" with { type: "json" };

export const languages = Object.freeze([
  { code: "de", tag: "de-DE", name: "Deutsch", short: "DE" },
  { code: "en", tag: "en-GB", name: "English", short: "EN" },
  { code: "ru", tag: "ru-RU", name: "Русский", short: "RU" },
  { code: "zh", tag: "zh-CN", name: "简体中文", short: "中文" },
  { code: "kk", tag: "kk-KZ", name: "Қазақша", short: "ҚАЗ" },
  { code: "pt", tag: "pt-PT", name: "Português", short: "PT" },
  { code: "es", tag: "es-ES", name: "Español", short: "ES" },
]);
export const LOCALE_STORAGE_KEY = "qcareer-locale";
const currentLocale = ref("ru");
export const locale = readonly(currentLocale);
export const language = () =>
  languages.find((item) => item.code === locale.value);
export const isLocale = (value) =>
  languages.some((item) => item.code === value);
let initialized = false;

export function setLocale(value, persist = true) {
  if (!isLocale(value)) return false;
  currentLocale.value = value;
  if (typeof document !== "undefined") document.documentElement.lang = value;
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, value);
    } catch {
      /* Private browsing may disable storage. */
    }
  }
  return true;
}

export function initLocale() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    setLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY), false);
  } catch {
    /* Keep the default. */
  }
  window.addEventListener("storage", (event) => {
    if (event.key === LOCALE_STORAGE_KEY)
      setLocale(event.newValue || "ru", false);
  });
}

export const number = (value, options = {}) =>
  // Some embedded Chromium builds omit Kazakh ICU data. Russian uses the same
  // decimal/group separators; using it for numbers avoids an English fallback.
  new Intl.NumberFormat(
    locale.value === "kk" ? "ru-RU" : language().tag,
    options,
  ).format(value);

export const unit = (value, name, display = "short") =>
  locale.value === "kk" && ["hour", "month"].includes(name)
    ? `${number(value)} ${name === "month" ? "ай" : display === "long" ? "сағат" : "сағ."}`
    : number(value, { style: "unit", unit: name, unitDisplay: display });

// Message objects keep asynchronous errors translatable if the language changes.
export const message = (key, params = {}) => ({ key, params });
export function translate(source, params = {}) {
  const code = locale.value;
  if (source == null) return "";
  if (typeof source === "number") return number(source);
  if (typeof source === "object" && source.key)
    return translate(source.key, source.params);
  if (typeof source !== "string") return String(source);
  const key = source.replace(/\s+/g, " ").trim();
  const text = messages[key]?.[code] ?? (code === "ru" ? key : source);
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name)
      ? typeof params[name] === "string" &&
        ["name", "file", "code"].includes(name)
        ? params[name]
        : String(translate(params[name]))
      : match,
  );
}

export function formatDate(value) {
  if (!value) return translate("Не указано");
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  if (!Number.isFinite(date.getTime())) return translate("Не указано");
  if (locale.value === "kk") {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        ...(value.length === 10 ? { timeZone: "UTC" } : {}),
      })
        .formatToParts(date)
        .map(({ type, value }) => [type, value]),
    );
    const months = [
      "қаң.",
      "ақп.",
      "нау.",
      "сәу.",
      "мам.",
      "мау.",
      "шіл.",
      "там.",
      "қыр.",
      "қаз.",
      "қар.",
      "жел.",
    ];
    return `${parts.year} ж. ${Number(parts.day)} ${months[Number(parts.month) - 1]}`;
  }
  return new Intl.DateTimeFormat(language().tag, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(value.length === 10 ? { timeZone: "UTC" } : {}),
  }).format(date);
}

export const formatPercent = (value) =>
  value == null
    ? translate("Нет данных")
    : number(value / 100, { style: "percent", maximumFractionDigits: 1 });

// API locales remain ru/en/kk. Read translations already carried by catalogue
// records locally; switching the UI never regenerates recommendations or writes data.
export function catalogText(record, field = "name", fallback = "") {
  if (!record) return translate(fallback);
  const localized = record.translations?.[locale.value];
  if (typeof localized === "string" && ["name", "title"].includes(field))
    return localized;
  if (typeof localized?.[field] === "string") return localized[field];
  const english = record.translations?.en;
  const source =
    typeof english === "string" && ["name", "title"].includes(field)
      ? english
      : (english?.[field] ?? record[field] ?? fallback);
  return translate(source);
}

export function uiError(error) {
  const source =
    error?.message ||
    "Сервер недоступен или не ответил вовремя. Повторите запрос.";
  if (messages[source]) return source;
  const invalid = source.match(
    /^Сервер вернул некорректный ответ \(HTTP (\d+)\)\.$/,
  );
  if (invalid)
    return message("Сервер вернул некорректный ответ (HTTP {status}).", {
      status: invalid[1],
    });
  const keys = {
    400: "Проверьте введённые данные и повторите действие.",
    404: "Запись не найдена. Обновите страницу.",
    409: "Данные изменились или действие уже выполнено. Обновите страницу.",
    422: "Данные не прошли проверку. Исправьте ошибки и повторите действие.",
    429: "Слишком много запросов. Попробуйте немного позже.",
  };
  return message(
    keys[error?.status] ||
      "Не удалось выполнить запрос. Повторите попытку. Код: {code}",
    {
      code: error?.code || error?.status || "UNKNOWN",
    },
  );
}
