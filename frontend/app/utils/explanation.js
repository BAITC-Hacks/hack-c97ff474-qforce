import { translate as t, locale, number } from "./i18n.js";
import { formats } from "./labels.js";

// Render the same server evidence in the selected language. No client scoring,
// estimated facts or AI calls are involved in changing language.
export function explainRecommendation(rec, names = {}) {
  const name = (kind, id, fallback = id) => {
    const label = names[kind]?.(id);
    return label && label !== id ? label : t(fallback);
  };
  const amount = (value) => number(value, { maximumFractionDigits: 6 });
  const lines = (rec.factors || []).flatMap((factor) => {
    const facts = factor.facts || {};
    if (factor.category === "CAREER_CONTEXT")
      return [
        t("Роль {role}, переход {current} → {next}.", {
          role: name("roleName", facts.roleId),
          current: name("gradeName", facts.currentGradeId),
          next: name("gradeName", facts.nextGradeId),
        }),
      ];
    if (factor.category === "SKILL_GAP") {
      if (![facts.currentLevel, facts.requiredLevel, facts.actualGain].every(Number.isFinite)) return [];
      const skillLabel = (locale.value === "ru" ? facts.skillNameRu : locale.value === "kk" ? facts.skillNameKk : facts.skillName) || facts.skillId;
      return [
        t(
          "{skill}: уровень {current}, требование {required}; ожидаемый прирост {gain}.",
          {
            skill: name("skillName", facts.skillId, skillLabel),
            current: amount(facts.currentLevel),
            required: amount(facts.requiredLevel),
            gain: amount(facts.actualGain),
          },
        ),
        ...(facts.critical === true ? [t("Критичный навык.")] : []),
        ...(Number.isFinite(facts.nextLevel) ? [t("Ожидаемый уровень после шага: {level}.", { level: amount(facts.nextLevel) })] : []),
      ];
    }
    if (factor.category !== "PARTICIPATION_HISTORY") return [];
    if (factor.reasonCode === "NO_RECORDED_HISTORY")
      return [
        t("История участия отсутствует; предпочтения по формату неизвестны."),
      ];
    if (factor.reasonCode === "NO_RELEVANT_HISTORY")
      return [t("История есть, но сопоставимого добровольного обучения по этим навыкам пока нет; предпочтение неизвестно.")];
    if (factor.reasonCode === "OBSERVED_RELEVANT_HISTORY") {
      if (![facts.relevantCompleted, facts.relevantMissedOrDeclined, facts.relevantDropped].every(Number.isFinite)) return [];
      return [
        t("Сопоставимое добровольное обучение: завершений {completed}, пропусков и отказов {missed}, прерванных активностей {dropped}.", {
          completed: facts.relevantCompleted,
          missed: facts.relevantMissedOrDeclined,
          dropped: facts.relevantDropped,
        }),
        t("Недавний опыт и совпадение формата и типа имеют больший вес; это мягкий сигнал предпочтения."),
        ...(Number.isFinite(facts.recencyHalfLifeDays) ? [t("Влияние опыта снижается вдвое за {days} дней.", { days: facts.recencyHalfLifeDays })] : []),
      ];
    }
    // Retain old saved sets without treating unknown history schemas as old ones.
    if (factor.reasonCode !== "OBSERVED_FORMAT_HISTORY" || ![facts.sameFormatCompleted, facts.sameFormatMissedOrDeclined].every(Number.isFinite)) return [];
    return [
      t(
        "Формат {format}: завершений {completed}, пропусков и отказов {missed}; это мягкий сигнал предпочтения.",
        {
          format: Object.hasOwn(formats, facts.format) ? formats[facts.format] : facts.format,
          completed: facts.sameFormatCompleted,
          missed: facts.sameFormatMissedOrDeclined,
        },
      ),
    ];
  });
  return lines.join(" ") || t(rec.explanation);
}
