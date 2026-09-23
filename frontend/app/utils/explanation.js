import { translate as t, locale, number, formatDate } from "./i18n.js";
import { formats } from "./labels.js";

// Render the same server evidence in the selected language. No client scoring,
// estimated facts or AI calls are involved in changing language.
export function explainRecommendation(rec, names = {}) {
  const name = (kind, id, fallback = id) => {
    const label = names[kind]?.(id);
    return label && label !== id ? label : t(fallback);
  };
  const amount = (value) => number(value, { maximumFractionDigits: 6 });
  const activities = (ids) => (ids || []).map(id => name('activityName', id)).join(', ');
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
          facts.requirementType === 'ACTIVITY_PREREQUISITE'
            ? "Входной навык для следующей активности: {skill}, уровень {current}, требуется {required}; ожидаемый прирост {gain}."
            : "{skill}: уровень {current}, требование {required}; ожидаемый прирост {gain}.",
          {
            skill: name("skillName", facts.skillId, skillLabel),
            current: amount(facts.currentLevel),
            required: amount(facts.requiredLevel),
            gain: amount(facts.actualGain),
          },
        ),
        ...(facts.critical === true ? [t("Критичный навык.")] : []),
        ...(Number.isFinite(facts.nextLevel) ? [t("Ожидаемый уровень после шага: {level}.", { level: amount(facts.nextLevel) })] : []),
        ...(facts.requirementType === 'ACTIVITY_PREREQUISITE' && facts.unlocksActivityIds?.length ? [t("Открывает доступ к: {activities}.", { activities: activities(facts.unlocksActivityIds) })] : []),
      ];
    }
    if (factor.category === 'SEQUENCE_CONTEXT' && facts.assumption === 'DAY_RESOLUTION_MINIMUM_DURATION') {
      return [t("Шаг {step}: ориентировочное начало {start}; следующий шаг не раньше {next}. Даты учитывают длительность и расписание, это не запись на сессию.", {
        step: facts.step, start: formatDate(facts.plannedStartDate), next: formatDate(facts.nextStepNotBefore),
      })];
    }
    if (factor.category === 'PLAN_COMPARISON' && [facts.weightedGapClosed, facts.alternativeWeightedGapClosed, facts.durationHours, facts.alternativeDurationHours].every(Number.isFinite)) {
      return [t("План {selected}: закрытие взвешенного разрыва {gain}, {hours} ч. Альтернатива {alternative}: {otherGain}, {otherHours} ч. Критичные разрывы учитываются с двойным весом.", {
        selected: activities(facts.selectedActivityIds), alternative: activities(facts.alternativeActivityIds), gain: amount(facts.weightedGapClosed),
        otherGain: amount(facts.alternativeWeightedGapClosed), hours: amount(facts.durationHours), otherHours: amount(facts.alternativeDurationHours),
      }), ...([facts.historyFit, facts.alternativeHistoryFit].every(Number.isFinite) ? [t("Соответствие наблюдаемой истории: {fit} против {alternativeFit}. Это сравнительный сигнал, а не вероятность успеха.", { fit: amount(facts.historyFit), alternativeFit: amount(facts.alternativeHistoryFit) })] : [])];
    }
    if (factor.category !== "PARTICIPATION_HISTORY") return [];
    if (factor.reasonCode === "NO_RECORDED_HISTORY")
      return [
        t("История участия отсутствует; предпочтения по формату неизвестны."),
      ];
    if (factor.reasonCode === "NO_RELEVANT_HISTORY")
      return [t("Нет сопоставимого необязательного обучения по собственной записи; предпочтение неизвестно.")];
    if (factor.reasonCode === "OBSERVED_RELEVANT_HISTORY") {
      if (![facts.relevantCompleted, facts.relevantMissedOrDeclined, facts.relevantDropped].every(Number.isFinite)) return [];
      return [
        t(facts.scope === 'SELF_ASSIGNED_NONMANDATORY_SHARED_SKILLS_OR_CATEGORY'
          ? "Сопоставимое обучение по собственной записи: завершений {completed}, пропусков и отказов {missed}, прерываний {dropped}."
          : "Сопоставимое необязательное обучение: завершений {completed}, пропусков и отказов {missed}, прерываний {dropped}.", {
          completed: facts.relevantCompleted,
          missed: facts.relevantMissedOrDeclined,
          dropped: facts.relevantDropped,
        }),
        t("Недавний опыт и совпадение формата и типа имеют больший вес; это мягкий сигнал предпочтения."),
        ...(Number.isFinite(facts.recencyHalfLifeDays) ? [t("Влияние опыта снижается вдвое за {days} дней.", { days: facts.recencyHalfLifeDays })] : []),
        ...(facts.dateBasis === 'PARTICIPATION_DATE_NOT_COMPLETION_TIME' ? [t("Давность считается по дате участия, а не по неизвестной дате завершения.")] : []),
        ...(Number.isFinite(facts.assignedRecords) && facts.assignedRecords > 0 ? [t("Назначенных другими записей: {count}; они не использованы как предпочтение.", { count: facts.assignedRecords })] : []),
        ...(Number.isFinite(facts.categoryMatchedRecords) && facts.categoryMatchedRecords > 0 ? [t("Совпадений только по категории навыка: {count}; их влияние слабее прямого совпадения навыков.", { count: facts.categoryMatchedRecords })] : []),
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
