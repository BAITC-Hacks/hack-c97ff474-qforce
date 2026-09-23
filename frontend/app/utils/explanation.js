import { translate as t } from "./i18n.js";
import { formats } from "./labels.js";

// Render the same server evidence in the selected language. No client scoring,
// estimated facts or AI calls are involved in changing language.
export function explainRecommendation(rec, names = {}) {
  const name = (kind, id) => names[kind]?.(id) ?? t(id);
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
    if (factor.category === "SKILL_GAP")
      return [
        t(
          "{skill}: уровень {current}, требование {required}; ожидаемый прирост {gain}.",
          {
            skill: name("skillName", facts.skillId),
            current: facts.currentLevel,
            required: facts.requiredLevel,
            gain: facts.actualGain,
          },
        ),
      ];
    if (factor.category !== "PARTICIPATION_HISTORY") return [];
    if (factor.reasonCode === "NO_RECORDED_HISTORY")
      return [
        t("История участия отсутствует; предпочтения по формату неизвестны."),
      ];
    return [
      t(
        "Формат {format}: завершений {completed}, пропусков и отказов {missed}; это мягкий сигнал предпочтения.",
        {
          format: formats[facts.format] ?? facts.format,
          completed: facts.sameFormatCompleted,
          missed: facts.sameFormatMissedOrDeclined,
        },
      ),
    ];
  });
  return lines.join(" ") || t(rec.explanation);
}
