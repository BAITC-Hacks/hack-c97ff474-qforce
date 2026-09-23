/* Run: node 06_tests/test_engine.cjs — no npm dependencies. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as E from "../app/utils/engine.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const j = (f) =>
  JSON.parse(fs.readFileSync(path.join(root, "app/data", f), "utf8"));
const se = j("skills.json"),
  data = {
    meta: j("employees.json").meta,
    employees: j("employees.json").employees,
    events: j("events.json").events,
    skills: se.skills,
    role_profiles: se.role_profiles,
    history: E.parseCSV(
      fs.readFileSync(path.join(root, "app/data/activity_history.csv"), "utf8"),
    ),
  };
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  }
}
const employee = (id) => data.employees.find((e) => e.employee_id === id),
  event = (id) => data.events.find((e) => e.event_id === id),
  asOf = data.meta.as_of_date;
function sample() {
  const d = E.clone(data),
    e = E.clone(employee("E0002"));
  e.employee_id = "T001";
  e.manager_id = null;
  e.last_review_date = "2026-07-01";
  e.skills = { SK_SYSTEM_DESIGN: 1, SK_API_DESIGN: 1, SK_PUBLIC_SPEAKING: 0 };
  d.employees = [e];
  d.history = [];
  return { d, e };
}
const row = (id, ev, when, status = "completed") => ({
  record_id: id,
  employee_id: "T001",
  event_id: ev,
  date: when,
  due_date: "",
  status,
  completion_pct: status === "completed" ? "100" : "0",
  score: "",
  feedback_rating: "",
  assigned_by: "self",
});
test("Original cardinalities 200 / 40 / 60 / 2743", () =>
  assert.deepEqual(
    [
      data.employees.length,
      data.events.length,
      data.skills.length,
      data.history.length,
    ],
    [200, 40, 60, 2743],
  ));
test("Business clock is 2026-10-01", () => assert.equal(asOf, "2026-10-01"));
test("Gain never lowers a level above cap", () =>
  assert.equal(E.gain(5, 1, 3), 5));
test("Gain respects max_level", () => assert.equal(E.gain(3, 2, 4), 4));
test("Gain respects global maximum 5", () => assert.equal(E.gain(4, 2, 8), 5));
test("Zero actual gain at cap", () => assert.equal(E.gain(3, 1, 3), 3));
test("Null goal is explicitly inferred", () =>
  assert.equal(E.target(employee("E0028")).inferred, true));
test("Lead without goal enters maintenance, not invented grade", () => {
  const t = E.target({
    ...employee("E0002"),
    grade: "Lead",
    career_goal: null,
  });
  assert.equal(t.target_grade, "Lead");
  assert.equal(t.maintenance, true);
});
test("Lateral target role preserved", () =>
  assert.equal(E.target(employee("E0004")).target_role, "Product Manager"));
test("Missing required skill is zero", () => {
  const { d, e } = sample();
  assert.equal(
    E.profile(d, e, asOf).gaps.find((g) => g.id === "SK_CLOUD").current,
    0,
  );
});
test("Completed after review applies gain", () => {
  const { d, e } = sample();
  d.history = [row("T1", "EV_005", "2026-08-01")];
  assert.equal(E.effectiveSkills(d, e, asOf).levels.SK_SYSTEM_DESIGN, 2);
});
test("Completed before review is not replayed", () => {
  const { d, e } = sample();
  d.history = [row("T1", "EV_005", "2026-06-01")];
  assert.equal(E.effectiveSkills(d, e, asOf).levels.SK_SYSTEM_DESIGN, 1);
});
test("Review-day boundary uses strict >", () => {
  const { d, e } = sample();
  d.history = [row("T1", "EV_005", "2026-07-01")];
  assert.equal(E.effectiveSkills(d, e, asOf).levels.SK_SYSTEM_DESIGN, 1);
});
test("in_progress does not grant skill gain", () => {
  const { d, e } = sample();
  d.history = [row("T1", "EV_005", "2026-08-01", "in_progress")];
  assert.equal(E.effectiveSkills(d, e, asOf).levels.SK_SYSTEM_DESIGN, 1);
});
test("Duplicate record ID replayed only once", () => {
  const { d, e } = sample();
  d.history = [
    row("T1", "EV_005", "2026-08-01"),
    row("T1", "EV_005", "2026-08-01"),
  ];
  assert.equal(E.effectiveSkills(d, e, asOf).levels.SK_SYSTEM_DESIGN, 2);
});
test("Future completion not replayed", () => {
  const { d, e } = sample();
  d.history = [row("T1", "EV_005", "2026-11-01")];
  assert.equal(E.effectiveSkills(d, e, asOf).levels.SK_SYSTEM_DESIGN, 1);
});
test("Explicit demo completed_at overrides enrolment proxy", () => {
  const { d, e } = sample();
  d.history = [
    { ...row("T1", "EV_005", "2026-06-01"), completed_at: "2026-08-01" },
  ];
  assert.equal(E.effectiveSkills(d, e, asOf).levels.SK_SYSTEM_DESIGN, 2);
});
test("Mandatory onboarding excluded even with gain", () => {
  const { d, e } = sample();
  assert.equal(E.inspect(d, e, event("EV_004"), asOf).eligible, false);
  assert.match(
    E.inspect(d, e, event("EV_004"), asOf).why.join(" "),
    /Обязательное/,
  );
});
test("Prerequisite blocks advanced System Design", () => {
  const { d, e } = sample();
  assert.equal(E.inspect(d, e, event("EV_006"), asOf).eligible, false);
});
test("Wrong current role cannot be bypassed by career goal", () => {
  const e = employee("E0004");
  assert.equal(E.inspect(data, e, event("EV_026"), asOf).eligible, false);
});
test("Wrong current grade is rejected", () => {
  const { d, e } = sample();
  e.grade = "Junior";
  assert.equal(E.inspect(d, e, event("EV_038"), asOf).eligible, false);
});
test("Completed non-repeatable voluntary event excluded", () => {
  const { d, e } = sample();
  d.history = [row("T1", "EV_005", "2026-06-01")];
  assert.equal(E.inspect(d, e, event("EV_005"), asOf).eligible, false);
});
test("EV_036 repeat exception honoured if useful", () => {
  const { d, e } = sample();
  d.history = [row("T1", "EV_036", "2026-06-01")];
  assert.equal(E.inspect(d, e, event("EV_036"), asOf).eligible, true);
});
test("self_paced has no need for session dates", () => {
  const { d, e } = sample();
  e.skills.SK_PYTHON = 1;
  assert.equal(E.inspect(d, e, event("EV_012"), asOf).eligible, true);
});
test("Scheduled event without future sessions rejected", () => {
  const { d, e } = sample();
  const v = { ...event("EV_005"), upcoming_sessions: ["2026-09-01"] };
  assert.equal(E.inspect(d, e, v, asOf).eligible, false);
});
test("Zero contribution to target is not recommended", () => {
  const { d, e } = sample();
  e.skills.SK_SYSTEM_DESIGN = 5;
  e.skills.SK_API_DESIGN = 5;
  assert.equal(E.inspect(d, e, event("EV_005"), asOf).eligible, false);
});
test("Baseline E0002 prioritises EV_005 rather than a blocked advanced event", () =>
  assert.equal(
    E.recommend(data, employee("E0002"), asOf)[0].event.event_id,
    "EV_005",
  ));
test("Critical gap can outrank lower public-speaking skill with three no-shows", () => {
  const { d, e } = sample();
  e.skills.SK_SYSTEM_DESIGN = 2;
  e.skills.SK_API_DESIGN = 2;
  d.history = [
    row("N1", "EV_036", "2026-08-01", "no_show"),
    row("N2", "EV_036", "2026-08-15", "no_show"),
    row("N3", "EV_036", "2026-09-01", "no_show"),
  ];
  assert.notEqual(E.recommend(d, e, asOf)[0].event.event_id, "EV_036");
});
test("No catalogue gain exists for SK_TEST_DESIGN", () =>
  assert.equal(
    data.events.some(
      (v) =>
        !v.mandatory &&
        v.develops_skills.some((s) => s.skill_id === "SK_TEST_DESIGN"),
    ),
    false,
  ));
test("All 200 profiles return at most 3 eligible, non-mandatory recommendations", () => {
  for (const e of data.employees) {
    const recs = E.recommend(data, e, asOf);
    assert.ok(recs.length <= 3);
    assert.ok(recs.every((r) => r.eligible && !r.event.mandatory));
  }
});
test("CSV quoting and escaped quotes parsed", () =>
  assert.deepEqual(E.parseCSV('a,b\n"x,y","z""q"\n'), [
    { a: "x,y", b: 'z"q' },
  ]));
test("Invalid calendar date rejected", () =>
  assert.equal(E.validDate("2026-02-30"), false));
test("Atomic import rejects invalid level and leaves source untouched", () => {
  const e = { ...E.clone(employee("E0002")), employee_id: "NEW1" };
  e.skills.SK_PYTHON = 6;
  const before = JSON.stringify(data);
  const result = E.mergeImport(data, [e], [], asOf);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(data), before);
});
test("New valid profile imported", () => {
  const e = { ...E.clone(employee("E0002")), employee_id: "NEW1" };
  const result = E.mergeImport(data, [e], [], asOf);
  assert.equal(result.ok, true);
  assert.equal(result.data.employees.length, 201);
});
test("Identical record ID is skipped", () => {
  const result = E.mergeImport(data, [], [data.history[0]], asOf);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 1);
});
test("Conflicting record ID rejected", () => {
  const result = E.mergeImport(
    data,
    [],
    [{ ...data.history[0], score: "99" }],
    asOf,
  );
  assert.equal(result.ok, false);
});
test("Same session with a different record ID rejected", () => {
  const result = E.mergeImport(
    data,
    [],
    [{ ...data.history[0], record_id: "NEW_SESSION" }],
    asOf,
  );
  assert.equal(result.ok, false);
});
test("Existing repeated mandatory compliance completions are not rejected", () =>
  assert.equal(E.mergeImport(data, [], [], asOf).ok, true));
const report = {
  count: results.length,
  passed: results.filter((x) => x.passed).length,
  failed: results.filter((x) => !x.passed).length,
  tests: results,
};

console.log(`${report.passed}/${report.count} tests passed`);
for (const t of results.filter((x) => !x.passed))
  console.error(t.name + ": " + t.error);
if (report.failed) process.exitCode = 1;
