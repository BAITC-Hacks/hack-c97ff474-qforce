import { reactive, computed, markRaw } from "vue";
import * as E from "../utils/engine.js";
import employees from "../data/employees.json";
import events from "../data/events.json";
import skills from "../data/skills.json";
import csv from "../data/activity_history.csv?raw";

const baseline = {
  meta: employees.meta,
  employees: employees.employees,
  events: events.events,
  skills: skills.skills,
  role_profiles: skills.role_profiles,
  history: E.parseCSV(csv),
};
const freshState = () => ({
  employeeId: "E0002",
  eventId: "EV_005",
  asOf: baseline.meta.as_of_date,
  goals: {},
  plan: [],
  lastCompletion: null,
  mode: "employee",
});
const store = reactive({
  data: markRaw(E.clone(baseline)),
  revision: 0,
  state: freshState(),
  toast: "",
  hydrated: false,
});
let timer;
function notify(text) {
  store.toast = text;
  clearTimeout(timer);
  timer = setTimeout(() => (store.toast = ""), 4500);
}
function save() {
  try {
    localStorage.setItem(
      "qcareer-vue-v1",
      JSON.stringify({ data: store.data, state: store.state }),
    );
  } catch {
    notify(
      "Хранилище браузера недоступно. Изменения останутся до закрытия страницы.",
    );
  }
}
function hydrate() {
  if (store.hydrated) return;
  try {
    const saved = JSON.parse(localStorage.getItem("qcareer-vue-v1") || "null");
    if (
      saved?.data?.employees?.length &&
      saved.data.history &&
      saved.state &&
      E.validDate(saved.state.asOf)
    ) {
      const check = E.mergeImport(
        baseline,
        saved.data.employees,
        [],
        saved.state.asOf,
      );
      if (check.ok) {
        store.data = markRaw(saved.data);
        store.state = { ...freshState(), ...saved.state };
      }
    }
  } catch {
    /* Invalid local state falls back to the source dataset. */
  }
  store.hydrated = true;
}
const employee = computed(
  () =>
    store.data.employees.find(
      (e) => e.employee_id === store.state.employeeId,
    ) || store.data.employees[0],
);
function context(person = employee.value) {
  // Dataset mutations increment revision; large reference arrays stay unproxied.
  void store.revision;
  const { data, state } = store;
  return {
    employee: person,
    p: E.profile(data, person, state.asOf, state.goals[person.employee_id]),
    recs: E.recommend(
      data,
      person,
      state.asOf,
      state.goals[person.employee_id],
    ),
    history: E.historyFor(data, person.employee_id).filter(
      (r) => r.date <= state.asOf,
    ),
  };
}
const current = computed(() => context());
const selected = computed(() => {
  void store.revision;
  const event =
    store.data.events.find((e) => e.event_id === store.state.eventId) ||
    current.value.recs[0]?.event ||
    store.data.events[4];
  return E.inspect(
    store.data,
    employee.value,
    event,
    store.state.asOf,
    store.state.goals[employee.value.employee_id],
  );
});
const skillName = (id) =>
  store.data.skills.find((s) => s.skill_id === id)?.name || id;
function selectEmployee(id) {
  if (!store.data.employees.some((e) => e.employee_id === id)) return;
  store.state.employeeId = id;
  store.state.eventId = current.value.recs[0]?.event.event_id || "EV_005";
  save();
}
function selectEvent(id) {
  if (store.data.events.some((e) => e.event_id === id)) {
    store.state.eventId = id;
    save();
    return true;
  }
  return false;
}
function saveGoal(goal) {
  if (
    !store.data.role_profiles.some(
      (p) => p.role === goal.target_role && p.grade === goal.target_grade,
    )
  )
    return notify("Неизвестная роль или грейд");
  store.state.goals[employee.value.employee_id] = { ...goal };
  save();
  notify("Цель сохранена. Рекомендации пересчитаны.");
}
function enroll() {
  const r = selected.value,
    key = employee.value.employee_id + ":" + r.event.event_id;
  if (!r.eligible) return notify("Активность недоступна для текущего профиля.");
  if (store.state.plan.includes(key))
    return notify("Активность уже в вашем плане.");
  store.state.plan.push(key);
  save();
  notify("Активность добавлена в личный план.");
}
function complete() {
  const r = selected.value,
    person = employee.value;
  if (!r.eligible) return notify("Активность не прошла проверки.");
  const when =
    r.event.format === "self_paced" ? store.state.asOf : r.nextSession;
  const rid = `DEMO_${person.employee_id}_${r.event.event_id}_${when}`;
  if (
    store.data.history.some(
      (x) =>
        x.record_id === rid ||
        (x.employee_id === person.employee_id &&
          x.event_id === r.event.event_id &&
          x.status === "completed" &&
          (x.completed_at || x.date) === when),
    )
  )
    return notify("Эта сессия уже учтена. Повтор не начислен.");
  const before = r.profile.progress,
    changes = E.clone(r.changes);
  const ongoing = store.data.history
    .filter(
      (x) =>
        x.employee_id === person.employee_id &&
        x.event_id === r.event.event_id &&
        x.status === "in_progress",
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (ongoing) {
    ongoing.status = "completed";
    ongoing.completion_pct = "100";
    ongoing.completed_at = when;
  } else
    store.data.history.push({
      record_id: rid,
      employee_id: person.employee_id,
      event_id: r.event.event_id,
      date: when,
      completed_at: when,
      due_date: "",
      status: "completed",
      completion_pct: "100",
      score: "",
      feedback_rating: "",
      assigned_by: "self",
    });
  store.revision++;
  store.state.asOf = when;
  store.state.plan = store.state.plan.filter(
    (x) => x !== person.employee_id + ":" + r.event.event_id,
  );
  store.state.lastCompletion = {
    employeeId: person.employee_id,
    eventId: r.event.event_id,
    before,
    after: context().p.progress,
    changes,
  };
  save();
  notify("Выполнение сохранено в демо. Навыки и рекомендации пересчитаны.");
}
function aggregate(department = "all") {
  void store.revision;
  const people = store.data.employees.filter(
      (e) => department === "all" || e.department === department,
    ),
    rows = people.map((e) => ({ e, c: context(e) })),
    skillAgg = {};
  for (const { c } of rows)
    for (const g of c.p.gaps) {
      if (!skillAgg[g.id])
        skillAgg[g.id] = { id: g.id, n: 0, missing: 0, critical: 0 };
      skillAgg[g.id].n++;
      if (g.gap) {
        skillAgg[g.id].missing++;
        if (g.critical) skillAgg[g.id].critical++;
      }
    }
  const pids = new Set(people.map((e) => e.employee_id)),
    voluntary = new Set(
      store.data.events.filter((e) => !e.mandatory).map((e) => e.event_id),
    );
  const history = store.data.history.filter(
    (r) =>
      pids.has(r.employee_id) &&
      r.date <= store.state.asOf &&
      voluntary.has(r.event_id),
  );
  return {
    people,
    rows,
    skills: Object.values(skillAgg).sort((a, b) => b.missing - a.missing),
    history,
    noStep: rows.filter((r) => !r.c.recs.length),
    noGoal: people.filter(
      (e) => !e.career_goal && !store.state.goals[e.employee_id],
    ),
  };
}
async function importData(files) {
  if (!files.length)
    return {
      ok: false,
      errors: ["Сначала выберите файлы профилей и/или истории."],
    };
  try {
    const newEmployees = [],
      newHistory = [];
    for (const file of files) {
      if (file.size > 3 * 1024 * 1024)
        throw Error(file.name + ": файл больше 3 МБ");
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const object = JSON.parse(text);
        if (!Array.isArray(object.employees))
          throw Error(file.name + ": ожидается объект с массивом employees");
        if (
          object.meta?.as_of_date &&
          object.meta.as_of_date !== baseline.meta.as_of_date
        )
          throw Error(
            file.name + ": дата среза не совпадает с исходным набором",
          );
        newEmployees.push(...object.employees);
      } else if (file.name.toLowerCase().endsWith(".csv"))
        newHistory.push(...E.parseCSV(text));
      else throw Error("Поддерживаются JSON профилей и CSV истории");
    }
    const result = E.mergeImport(
      store.data,
      newEmployees,
      newHistory,
      store.state.asOf,
    );
    if (result.ok) {
      store.data = markRaw(result.data);
      save();
      notify("Данные импортированы. Сводка обновлена.");
      return {
        ok: true,
        profiles: result.profiles,
        added: result.added,
        skipped: result.skipped,
      };
    }
    return result;
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}
function reset() {
  store.data = markRaw(E.clone(baseline));
  store.state = freshState();
  save();
  notify("Исходный набор восстановлен.");
}
function createProfile(name, role, grade) {
  const rp = store.data.role_profiles.find(
    (p) => p.role === role && p.grade === grade,
  );
  if (!name.trim() || !rp) return false;
  const id = "DEMO_" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const assessment = new Date(store.state.asOf + "T12:00:00Z");
  assessment.setUTCDate(assessment.getUTCDate() - 1);
  const assessmentDate = assessment.toISOString().slice(0, 10);
  store.data.employees.push({
    employee_id: id,
    full_name: name.trim(),
    department:
      store.data.employees.find((e) => e.role === role)?.department || role,
    role,
    grade,
    manager_id: null,
    hire_date: assessmentDate,
    tenure_months: 0,
    work_format: "hybrid",
    preferred_language: "ru",
    career_goal: null,
    skills: { ...rp.required_skills },
    last_review_date: assessmentDate,
  });
  store.revision++;
  selectEmployee(id);
  notify(
    "Локальный демо-профиль создан. Навыки заданы по матрице выбранного грейда.",
  );
  return true;
}
export function useCareer() {
  return {
    store,
    employee,
    current,
    selected,
    context,
    skillName,
    selectEmployee,
    selectEvent,
    saveGoal,
    enroll,
    complete,
    aggregate,
    importData,
    reset,
    createProfile,
    save,
    hydrate,
    notify,
    E,
  };
}
