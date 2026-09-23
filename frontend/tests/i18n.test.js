import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { computed } from "vue";
import messages from "../app/locales/messages.json" with { type: "json" };
import {
  locale,
  languages,
  setLocale,
  translate as t,
  message,
  number,
  formatDate,
  formatPercent,
  catalogText,
  uiError,
  initLocale,
  LOCALE_STORAGE_KEY,
} from "../app/utils/i18n.js";
import { explainRecommendation } from "../app/utils/explanation.js";

afterEach(() => setLocale("ru", false));
const placeholders = (text) =>
  [...new Set(text.match(/\{\w+\}/g) || [])].sort();

test("seven complete dictionaries preserve every interpolation", () => {
  assert.deepEqual(
    languages.map((l) => l.code),
    ["de", "en", "ru", "zh", "kk", "pt", "es"],
  );
  for (const [key, entry] of Object.entries(messages)) {
    for (const { code } of languages) {
      if (code === "ru" && !entry.ru) continue;
      assert.ok(entry[code]?.trim(), `${code}: ${key}`);
      assert.deepEqual(
        placeholders(entry[code]),
        placeholders(key),
        `${code}: ${key}`,
      );
    }
  }
});

test("all literal UI translation calls have dictionary entries", () => {
  function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      return entry.isDirectory() ? walk(path) : [path];
    });
  }
  for (const file of walk(new URL("../app/", import.meta.url))) {
    if (!/\.(vue|js)$/.test(file.pathname)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /\b(?:t|message)\(\s*(["'])(.*?)\1/gs,
    )) {
      if (/[А-Яа-яЁё]/.test(match[2]))
        assert.ok(messages[match[2]], `${file}: ${match[2]}`);
    }
  }
});

test("locale changes update computed labels and structured errors without changing data", () => {
  const label = computed(() => t("Войти"));
  const error = message(
    "Неизвестный файл: {file}. Используйте названия из списка справа.",
    { file: "my-file.json" },
  );
  assert.equal(label.value, "Войти");
  setLocale("en", false);
  assert.equal(label.value, "Sign in");
  assert.match(t(error), /Unknown file: my-file.json/);
  setLocale("zh", false);
  assert.equal(label.value, "登录");
  assert.match(t(error), /未知文件：my-file.json/);
  assert.equal(setLocale("invalid", false), false);
  assert.equal(locale.value, "zh");
});

test("date-only values, percentages, decimals and zero respect each locale", () => {
  for (const { code, tag } of languages) {
    setLocale(code, false);
    assert.equal(
      number(1234.5),
      new Intl.NumberFormat(code === "kk" ? "ru-RU" : tag).format(1234.5),
    );
    assert.equal(
      formatPercent(75.5),
      new Intl.NumberFormat(code === "kk" ? "ru-RU" : tag, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(0.755),
    );
    assert.equal(
      formatDate("2026-10-01"),
      code === "kk"
        ? "2026 ж. 1 қаз."
        : new Intl.DateTimeFormat(tag, {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date("2026-10-01T12:00:00Z")),
    );
    assert.equal(formatDate("not-a-date"), t("Не указано"));
    assert.equal(t("{p0} ч", { p0: 0 }).includes("0"), true);
    assert.equal(formatPercent(null), t("Нет данных"));
  }
});

test("explicit imported translations win, unknown content and names are preserved", () => {
  setLocale("de", false);
  assert.equal(
    catalogText(
      {
        title: "Custom activity",
        translations: { de: { title: "Eigener Kurs" } },
      },
      "title",
    ),
    "Eigener Kurs",
  );
  assert.equal(
    catalogText({ title: "Custom activity" }, "title"),
    "Custom activity",
  );
  assert.equal(catalogText({ name: "SQL" }), "SQL");
  assert.ok(
    t("Здравствуйте, {name}. Здесь ваш путь, следующий шаг и прогресс.", {
      name: "Leadership",
    }).includes("Leadership"),
  );
  const events = JSON.parse(
    readFileSync(new URL("../app/data/events.json", import.meta.url)),
  );
  for (const event of events.events) {
    assert.ok(messages[event.title], event.title);
    assert.ok(messages[event.description], event.description);
  }
});

test("recommendation translations use the original evidence and gains", () => {
  const rec = {
    factors: [
      {
        category: "SKILL_GAP",
        facts: {
          skillId: "SQL",
          currentLevel: 2,
          requiredLevel: 4,
          actualGain: 0.5,
        },
      },
      {
        category: "PARTICIPATION_HISTORY",
        reasonCode: "NO_RECORDED_HISTORY",
        facts: {},
      },
    ],
  };
  const original = JSON.stringify(rec);
  setLocale("en", false);
  assert.match(
    explainRecommendation(rec),
    /SQL: level 2, requirement 4; expected gain 0.5/,
  );
  setLocale("de", false);
  assert.match(explainRecommendation(rec), /Zuwachs 0,5/);
  assert.equal(JSON.stringify(rec), original);
  assert.match(
    t(uiError({ status: 404, message: "Unknown employee" })),
    /Eintrag nicht gefunden/,
  );
});

test("persisted preference restores, other tabs sync, unavailable storage is safe", () => {
  const saved = new Map([[LOCALE_STORAGE_KEY, "es"]]);
  const listeners = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => saved.get(k),
      setItem: (k, v) => saved.set(k, v),
    },
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    },
  };
  globalThis.document = { documentElement: { lang: "ru" } };
  try {
    initLocale();
    assert.equal(locale.value, "es");
    setLocale("kk");
    assert.equal(saved.get(LOCALE_STORAGE_KEY), "kk");
    assert.equal(document.documentElement.lang, "kk");
    listeners.storage({ key: LOCALE_STORAGE_KEY, newValue: "pt" });
    assert.equal(locale.value, "pt");
    window.localStorage.setItem = () => {
      throw Error("Blocked");
    };
    assert.doesNotThrow(() => setLocale("zh"));
    assert.equal(locale.value, "zh");
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
