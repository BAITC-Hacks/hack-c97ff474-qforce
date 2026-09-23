import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { File } from "node:buffer";
import { test } from "node:test";
import { computed, ref, shallowRef } from "vue";
import { useLocale } from "../app/composables/useLocale.js";
import { translate as t } from "../app/utils/i18n.js";

// Exercise the script used by the actual screen with a transport stub. These
// tests guard import sequencing; backend integration tests validate the payload.
function importScreen(request) {
  const source = readFileSync(
    new URL("../app/pages/import.vue", import.meta.url),
    "utf8",
  ).match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*?;\s*$/gm, '');
  const route = { query: {} };
  const router = {
    replace: async ({ query }) => {
      route.query = query;
    },
  };
  const build = new Function(
    "useLocale",
    "useApi",
    "useRoute",
    "useRouter",
    "ref",
    "shallowRef",
    "computed",
    "onMounted",
    source +
      "\nreturn { choose, run, result, error, busy, canApply, reportWarning };",
  );
  return {
    ...build(
      useLocale,
      () => ({ request }),
      () => route,
      () => router,
      ref,
      shallowRef,
      computed,
      () => {},
    ),
    route,
  };
}
const report = (valid = true) => ({
  valid,
  counts: { create: 1, update: 0, skip: 0, conflict: 0 },
  diagnostics: [],
  records: {},
  rules: { asOfDate: "2026-10-01" },
});
const packageFile = () =>
  new File(['{"employees":[]}'], "employees.json", {
    type: "application/json",
  });

test("import requires a successful dry run and sends the backend multipart field before applying", async () => {
  const calls = [];
  const screen = importScreen(async (path, options) => {
    calls.push({ path, options });
    if (path === "/imports/dry-run")
      return {
        data: { id: "validated-run", status: "VALIDATED", report: report() },
      };
    if (path === "/imports")
      return {
        data: { id: "applied-run", status: "APPLIED", report: report() },
      };
    return {
      data: {
        id: path.split("/").pop(),
        status: path.endsWith("applied-run") ? "APPLIED" : "VALIDATED",
        report: report(),
      },
    };
  });
  screen.choose([packageFile()]);
  await screen.run(true);
  assert.equal(
    calls.length,
    0,
    "applying an unvalidated package must not issue a request",
  );
  await screen.run(false);
  assert.equal(calls[0].path, "/imports/dry-run");
  assert.deepEqual([...calls[0].options.body.keys()], ["employees"]);
  assert.equal(calls[0].options.body.get("employees").name, "employees.json");
  assert.equal(screen.canApply.value, true);
  await screen.run(true);
  assert.equal(calls[2].path, "/imports");
  assert.equal(
    calls[3].path,
    "/imports/applied-run",
    "read the persisted result after writing",
  );
  assert.equal(screen.result.value.status, "APPLIED");
  assert.deepEqual(screen.route.query, { run: "applied-run" });
  assert.equal(screen.canApply.value, false);
});

test("HTTP 200 with a rejected validation report never enables applying", async () => {
  const calls = [];
  const screen = importScreen(async (path) => {
    calls.push(path);
    return {
      data: { id: "rejected-run", status: "REJECTED", report: report(false) },
    };
  });
  screen.choose([packageFile()]);
  await screen.run(false);
  assert.equal(screen.canApply.value, false);
  assert.equal(screen.result.value.status, "REJECTED");
  await screen.run(true);
  assert.ok(!calls.includes("/imports"));
});

test("changing files invalidates a previously successful check", async () => {
  const screen = importScreen(async () => ({
    data: { id: "checked", status: "VALIDATED", report: report() },
  }));
  screen.choose([packageFile()]);
  await screen.run(false);
  assert.equal(screen.canApply.value, true);
  screen.choose([packageFile()]);
  assert.equal(screen.canApply.value, false);
  assert.equal(screen.result.value, null);
  assert.deepEqual(screen.route.query, {});
});

test("failed apply displays server diagnostics and prevents repeated submission while pending", async () => {
  let rejectApply;
  let applyCalls = 0;
  const rejected = {
    id: "conflict-run",
    status: "REJECTED",
    report: report(false),
  };
  const screen = importScreen(async (path) => {
    if (path === "/imports") {
      applyCalls++;
      return new Promise((_, reject) => {
        rejectApply = reject;
      });
    }
    return { data: { id: "checked", status: "VALIDATED", report: report() } };
  });
  screen.choose([packageFile()]);
  await screen.run(false);
  const applying = screen.run(true);
  await screen.run(true);
  assert.equal(applyCalls, 1);
  rejectApply(
    Object.assign(new Error("Package rejected"), { details: rejected }),
  );
  await applying;
  assert.equal(screen.result.value.status, "REJECTED");
  assert.equal(screen.error.value, "Package rejected");
  assert.equal(screen.canApply.value, false);
  assert.equal(screen.busy.value, false);
});

test("report refresh failure preserves a confirmed applied result without pretending refresh succeeded", async () => {
  let applied = false;
  const screen = importScreen(async (path) => {
    if (path === "/imports") {
      applied = true;
      return { data: { id: "written", status: "APPLIED", report: report() } };
    }
    if (applied) throw new Error("Report unavailable");
    return { data: { id: "checked", status: "VALIDATED", report: report() } };
  });
  screen.choose([packageFile()]);
  await screen.run(false);
  await screen.run(true);
  assert.equal(screen.result.value.status, "APPLIED");
  assert.match(t(screen.reportWarning.value), /Отчёт недоступен/);
  assert.equal(screen.error.value, "");
});
