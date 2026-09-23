/* Career Quest — transparent deterministic reference engine, NOT an LLM. */

const GRADES = ["Junior", "Middle", "Senior", "Lead"];
const STATUS = [
  "completed",
  "in_progress",
  "dropped",
  "no_show",
  "declined",
  "overdue",
];
const clone = (x) => JSON.parse(JSON.stringify(x));
function gain(level, amount, cap) {
  return Math.max(level, Math.min(5, level + amount, cap));
}
function target(employee, override) {
  const explicit = override || employee.career_goal;
  if (explicit) return { ...explicit, inferred: false, maintenance: false };
  const i = GRADES.indexOf(employee.grade);
  return {
    target_role: employee.role,
    target_grade: GRADES[Math.min(i + 1, 3)],
    inferred: true,
    maintenance: i === 3,
  };
}
function historyFor(data, id) {
  return data.history.filter((r) => r.employee_id === id);
}
function effectiveSkills(data, employee, asOf) {
  const result = { ...employee.skills },
    applied = [],
    seen = new Set();
  const byEvent = Object.fromEntries(data.events.map((e) => [e.event_id, e]));
  historyFor(data, employee.employee_id)
    .filter(
      (r) =>
        r.status === "completed" &&
        (r.completed_at || r.date) > employee.last_review_date &&
        (r.completed_at || r.date) <= asOf,
    )
    .sort(
      (a, b) =>
        (a.completed_at || a.date).localeCompare(b.completed_at || b.date) ||
        a.record_id.localeCompare(b.record_id),
    )
    .forEach((r) => {
      if (seen.has(r.record_id)) return;
      seen.add(r.record_id);
      const event = byEvent[r.event_id];
      if (!event) return;
      for (const s of event.develops_skills)
        result[s.skill_id] = gain(result[s.skill_id] || 0, s.gain, s.max_level);
      applied.push(r.record_id);
    });
  return { levels: result, applied, proxy: true };
}
function profile(data, employee, asOf, override) {
  const goal = target(employee, override),
    actual = effectiveSkills(data, employee, asOf);
  const rp = data.role_profiles.find(
    (r) => r.role === goal.target_role && r.grade === goal.target_grade,
  );
  if (!rp) throw Error("Не найден профиль целевой роли / грейда");
  const gaps = Object.entries(rp.required_skills).map(([id, required]) => ({
    id,
    required,
    current: actual.levels[id] || 0,
    gap: Math.max(0, required - (actual.levels[id] || 0)),
    critical: rp.critical_skills.includes(id),
  }));
  const progress = gaps.length
    ? Math.round(
        (100 *
          gaps.reduce((s, g) => s + Math.min(g.current / g.required, 1), 0)) /
          gaps.length,
      )
    : 100;
  return {
    goal,
    actual,
    rp,
    gaps,
    progress,
    criticalOpen: gaps.filter((g) => g.critical && g.gap > 0),
    met: gaps.filter((g) => g.gap === 0).length,
  };
}
function inspect(data, employee, event, asOf, override, prepared) {
  const p = prepared?.profile || profile(data, employee, asOf, override),
    history =
      prepared?.history ||
      historyFor(data, employee.employee_id).filter((r) => r.date <= asOf),
    related = history.filter((r) => r.event_id === event.event_id),
    why = [];
  if (event.mandatory) why.push("Обязательное назначение: вне рекомендаций");
  if (!event.target_roles.includes(employee.role))
    why.push("Не соответствует текущей роли");
  if (!event.target_grades.includes(employee.grade))
    why.push("Не соответствует текущему грейду");
  for (const [id, min] of Object.entries(event.prerequisites))
    if ((p.actual.levels[id] || 0) < min)
      why.push(`Входной навык ${id}: ${p.actual.levels[id] || 0} < ${min}`);
  if (
    event.event_id !== "EV_036" &&
    related.some((r) => r.status === "completed")
  )
    why.push("Уже завершено: повтор не разрешён");
  const nextSession =
    event.format === "self_paced"
      ? asOf
      : event.upcoming_sessions.filter((d) => d >= asOf).sort()[0];
  if (!nextSession) why.push("Нет доступных будущих сессий");
  const changes = event.develops_skills.map((s) => {
    const current = p.actual.levels[s.skill_id] || 0,
      g = p.gaps.find((x) => x.id === s.skill_id),
      after = gain(current, s.gain, s.max_level);
    return {
      ...s,
      current,
      after,
      delta: after - current,
      required: g?.required || 0,
      critical: !!g?.critical,
      closure: g ? Math.min(g.gap, after - current) : 0,
    };
  });
  if (!changes.some((s) => s.closure > 0))
    why.push("Не сокращает разрыв до выбранной цели");
  const bad = related.filter((r) =>
    ["no_show", "dropped", "declined"].includes(r.status),
  ).length;
  const completedFormat = history.filter(
    (r) =>
      r.status === "completed" &&
      data.events.find((v) => v.event_id === r.event_id)?.format ===
        event.format,
  ).length;
  const resume = related.some((r) => r.status === "in_progress");
  const benefit = changes.reduce(
    (s, c) => s + c.closure * (c.critical ? 3 : 1),
    0,
  );
  const score =
    10 * benefit -
    0.75 * Math.min(3, bad) +
    Math.min(2, completedFormat / 5) +
    (resume ? 1 : 0);
  return {
    event,
    profile: p,
    eligible: why.length === 0,
    why,
    changes,
    score,
    nextSession,
    bad,
    completedFormat,
    resume,
    historyCount: history.length,
  };
}
function recommend(data, employee, asOf, override) {
  // Project the profile once per recommendation run, not once for every event.
  const prepared = {
    profile: profile(data, employee, asOf, override),
    history: historyFor(data, employee.employee_id).filter(
      (r) => r.date <= asOf,
    ),
  };
  return data.events
    .map((v) => inspect(data, employee, v, asOf, override, prepared))
    .filter((c) => c.eligible)
    .sort(
      (a, b) =>
        b.score - a.score || a.event.event_id.localeCompare(b.event.event_id),
    )
    .slice(0, 3);
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("CSV: незакрытая кавычка");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) throw Error("CSV пуст");
  const keys = rows.shift();
  if (new Set(keys).size !== keys.length)
    throw Error("CSV: повторяются заголовки");
  return rows.map((r, i) => {
    if (r.length !== keys.length)
      throw Error(`CSV: строка ${i + 2}, неверное число столбцов`);
    return Object.fromEntries(keys.map((k, j) => [k, r[j]]));
  });
}
function validDate(s) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
function mergeImport(base, newEmployees, newHistory, asOf) {
  const data = clone(base),
    errors = [],
    ids = new Set(base.skills.map((s) => s.skill_id)),
    ev = new Set(data.events.map((e) => e.event_id)),
    known = new Map(data.employees.map((e) => [e.employee_id, e]));
  const used = new Set();
  for (const e of newEmployees) {
    const label = e?.employee_id || "(без ID)";
    if (
      !e ||
      typeof e !== "object" ||
      typeof e.employee_id !== "string" ||
      !e.employee_id
    ) {
      errors.push("Профиль без employee_id");
      continue;
    }
    if (used.has(e.employee_id)) errors.push(label + ": повтор ID в импорте");
    used.add(e.employee_id);
    if (
      !data.role_profiles.some((r) => r.role === e.role && r.grade === e.grade)
    )
      errors.push(label + ": неизвестная роль/грейд");
    if (!validDate(e.last_review_date) || e.last_review_date > asOf)
      errors.push(label + ": некорректная дата оценки");
    if (!e.skills || typeof e.skills !== "object" || Array.isArray(e.skills))
      errors.push(label + ": нет объекта skills");
    else
      for (const [id, n] of Object.entries(e.skills))
        if (!ids.has(id) || !Number.isInteger(n) || n < 0 || n > 5)
          errors.push(label + ": неверный навык " + id);
    if (
      e.career_goal &&
      !data.role_profiles.some(
        (r) =>
          r.role === e.career_goal.target_role &&
          r.grade === e.career_goal.target_grade,
      )
    )
      errors.push(label + ": неизвестная цель");
    if (typeof e.full_name !== "string" || !e.full_name)
      errors.push(label + ": нет full_name");
    known.set(e.employee_id, e);
  }
  for (const e of newEmployees)
    if (e?.manager_id && !known.has(e.manager_id))
      errors.push(e.employee_id + ": неизвестный manager_id");
  const records = new Map(data.history.map((r) => [r.record_id, r]));
  const sessions = new Map(
    data.history.map((r) => [
      [r.employee_id, r.event_id, r.date].join("|"),
      r.record_id,
    ]),
  );
  let added = 0,
    skipped = 0;
  for (const r of newHistory) {
    const id = r.record_id || "(без ID)";
    if (!r.record_id || !known.has(r.employee_id) || !ev.has(r.event_id))
      errors.push(id + ": неверная ссылка на профиль / событие");
    if (!validDate(r.date) || r.date > asOf)
      errors.push(id + ": дата вне снимка");
    if (!STATUS.includes(r.status)) errors.push(id + ": неизвестный статус");
    const pct = Number(r.completion_pct);
    if (
      r.completion_pct === "" ||
      !Number.isInteger(pct) ||
      pct < 0 ||
      pct > 100
    )
      errors.push(id + ": неверный completion_pct");
    if (r.status === "completed" && pct !== 100)
      errors.push(id + ": completed требует 100%");
    if (["no_show", "declined"].includes(r.status) && pct !== 0)
      errors.push(id + ": no_show/declined требуют 0%");
    if (["in_progress", "dropped", "overdue"].includes(r.status) && pct > 95)
      errors.push(id + ": незавершённое участие не выше 95%");
    if (r.status === "dropped" && pct < 5)
      errors.push(id + ": dropped не ниже 5%");
    if (r.due_date && !validDate(r.due_date))
      errors.push(id + ": неверная due_date");
    if (
      r.completed_at &&
      (!validDate(r.completed_at) ||
        r.completed_at > asOf ||
        r.completed_at < r.date)
    )
      errors.push(id + ": неверная completed_at");
    const sessionKey = [r.employee_id, r.event_id, r.date].join("|");
    if (sessions.has(sessionKey) && sessions.get(sessionKey) !== r.record_id)
      errors.push(id + ": повтор одной сессии с другим ID");
    else sessions.set(sessionKey, r.record_id);
    for (const [k, lo, hi] of [
      ["score", 0, 100],
      ["feedback_rating", 1, 5],
    ])
      if (
        r[k] !== "" &&
        r[k] != null &&
        (!Number.isInteger(Number(r[k])) ||
          Number(r[k]) < lo ||
          Number(r[k]) > hi)
      )
        errors.push(id + ": неверное " + k);
    if (!["self", "manager", "hr"].includes(r.assigned_by))
      errors.push(id + ": неверный assigned_by");
    const old = records.get(r.record_id);
    if (old) {
      const keys = new Set([...Object.keys(old), ...Object.keys(r)]);
      if ([...keys].some((k) => String(old[k] ?? "") !== String(r[k] ?? "")))
        errors.push(id + ": конфликт записи");
      else skipped++;
    } else {
      records.set(r.record_id, r);
      added++;
    }
  }
  const completionCounts = {};
  for (const row of records.values()) {
    if (row.status !== "completed") continue;
    const activity = data.events.find((v) => v.event_id === row.event_id);
    if (!activity || activity.mandatory || activity.event_id === "EV_036")
      continue;
    const key = row.employee_id + "|" + row.event_id;
    completionCounts[key] = (completionCounts[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(completionCounts))
    if (count > 1)
      errors.push(
        key + ": повтор completed добровольной неповторяемой активности",
      );
  if (errors.length) return { ok: false, errors };
  data.employees = [...known.values()];
  data.history = [...records.values()];
  return { ok: true, data, profiles: newEmployees.length, added, skipped };
}

export {
  GRADES,
  STATUS,
  clone,
  gain,
  target,
  historyFor,
  effectiveSkills,
  profile,
  inspect,
  recommend,
  parseCSV,
  validDate,
  mergeImport,
};
