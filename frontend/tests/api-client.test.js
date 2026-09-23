import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createApiClient } from "../app/utils/api-client.js";
import { session, clearSession, saveToken } from "../app/utils/session.js";

const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const envelope = (data) => ({ data, meta: { requestId: "test-request" } });
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const transport = (fetcher, extra = {}) =>
  createApiClient({
    baseURL: "/api/v1/",
    getToken: () => "access-token",
    onUnauthorized: () => {},
    fetcher,
    ...extra,
  });

test("transport preserves the API prefix and false/zero query values, and sends bearer JSON", async () => {
  let actual;
  const api = transport(async (url, options) => {
    actual = { url, options };
    return reply(envelope({ id: "saved" }));
  });
  await api.request("/activities", {
    method: "POST",
    query: {
      department: "R&D / IT",
      mandatory: false,
      page: 0,
      omit: "",
      missing: null,
    },
    body: { activityId: "one" },
  });
  assert.equal(
    actual.url,
    "/api/v1/activities?department=R%26D+%2F+IT&mandatory=false&page=0",
  );
  assert.equal(
    actual.options.headers.get("Authorization"),
    "Bearer access-token",
  );
  assert.equal(actual.options.headers.get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(actual.options.body), { activityId: "one" });
  assert.equal(actual.options.cache, "no-store");
});

test("multipart keeps browser-generated boundaries and login does not send an existing token", async () => {
  const calls = [];
  const api = transport(async (_, options) => {
    calls.push(options);
    return reply(envelope({}));
  });
  const form = new FormData();
  form.append("employees", new Blob(["{}"]), "employees.json");
  await api.request("/imports/dry-run", { method: "POST", body: form });
  assert.equal(calls[0].body, form);
  assert.equal(calls[0].headers.has("Content-Type"), false);
  await api.request("/auth/login", {
    method: "POST",
    auth: false,
    body: { username: "employee", password: "test" },
  });
  assert.equal(calls[1].headers.has("Authorization"), false);
});

test("HTTP 422 retains safe backend diagnostics and HTTP 200 rejected import remains rejected", async () => {
  const report = { id: "run", status: "REJECTED", report: { valid: false } };
  const api = transport(async () =>
    reply(
      {
        code: "IMPORT_REJECTED",
        message: "Package rejected",
        details: report,
        requestId: "r1",
      },
      422,
    ),
  );
  await assert.rejects(api.request("/imports"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 422);
    assert.equal(error.code, "IMPORT_REJECTED");
    assert.deepEqual(error.details, report);
    assert.equal(error.requestId, "r1");
    return true;
  });
  const dryRun = transport(async () => reply(envelope(report)));
  assert.equal(
    (await dryRun.request("/imports/dry-run")).data.status,
    "REJECTED",
  );
});

test("malformed bodies remain errors and nullable successful data is preserved", async () => {
  const invalidJson = transport(
    async () => new Response("bad gateway", { status: 502 }),
  );
  await assert.rejects(invalidJson.request("/employees"), {
    code: "INVALID_RESPONSE",
    status: 502,
  });
  const missingEnvelope = transport(async () => reply({ success: true }));
  await assert.rejects(missingEnvelope.request("/employees"), {
    code: "INVALID_RESPONSE",
  });
  const nullError = transport(async () => reply(null, 500));
  await assert.rejects(
    nullError.request("/employees"),
    (error) => error instanceof ApiError && error.status === 500,
  );
  const nullable = transport(async () => reply(envelope(null)));
  assert.equal(
    (await nullable.request("/employees/a/recommendations/latest")).data,
    null,
  );
});

test("pagination uses meta.total and rejects an unexplained truncated page", async () => {
  const urls = [];
  const pages = [[{ id: "a" }, { id: "b" }], [{ id: "c" }]];
  const api = transport(async (url) => {
    urls.push(url);
    return reply({ data: pages.shift(), meta: { total: 3, requestId: "r" } });
  });
  assert.deepEqual(
    (await api.allPages("/employees")).map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.equal(urls[1], "/api/v1/employees?page=2&pageSize=100");
  const incomplete = transport(async () =>
    reply({ data: [], meta: { total: 1 } }),
  );
  await assert.rejects(incomplete.allPages("/employees"), {
    code: "INVALID_RESPONSE",
  });
});

test("late unauthorized response from an old session cannot log out a new session", async () => {
  const pending = deferred();
  let token = "old",
    version = 1,
    invalidations = 0;
  const api = transport(() => pending.promise, {
    getToken: () => token,
    getSessionVersion: () => version,
    onUnauthorized: () => {
      invalidations++;
      token = "";
    },
  });
  const first = api.request("/auth/me");
  token = "new";
  version++;
  pending.resolve(reply({ code: "UNAUTHORIZED", message: "Expired" }, 401));
  await assert.rejects(first, { code: "SESSION_CHANGED" });
  assert.equal(token, "new");
  assert.equal(invalidations, 0);
});

test("session version also rejects stale successful responses when a replacement JWT happens to match", async () => {
  const pending = deferred();
  let version = 1;
  const api = transport(() => pending.promise, {
    getSessionVersion: () => version,
  });
  const first = api.request("/employees/a");
  version++;
  pending.resolve(reply(envelope({ fullName: "Previous session" })));
  await assert.rejects(first, { code: "SESSION_CHANGED" });
});

test("a current 401 clears authentication and employee data through the shared session reset", async () => {
  globalThis.useApi = () => ({
    request: async () => envelope(null),
    allPages: async () => [],
  });
  const { useCareer } = await import("../app/composables/useCareer.js");
  const career = useCareer();
  saveToken("expired");
  session.user = { id: "u", employeeId: "a", role: "EMPLOYEE" };
  career.store.profile = { id: "a", fullName: "Private name" };
  career.store.history = [{ id: "private-participation" }];
  career.store.recommendations = { employeeId: "a" };
  const api = transport(async () => reply({ code: "UNAUTHORIZED" }, 401), {
    getToken: () => session.token,
    getSessionVersion: () => session.version,
    onUnauthorized: clearSession,
  });
  await assert.rejects(api.request("/employees/a"), { status: 401 });
  assert.equal(session.user, null);
  assert.equal(career.store.profile, null);
  assert.equal(career.store.recommendations, null);
  assert.deepEqual(career.store.history, []);
  delete globalThis.useApi;
});

test("late recommendation generation and catalog reads cannot repopulate a replacement profile", async () => {
  const pending = deferred();
  globalThis.useApi = () => ({
    request: () => pending.promise,
    allPages: async () => [],
  });
  const { useCareer } = await import("../app/composables/useCareer.js");
  const career = useCareer();
  saveToken("a");
  career.store.profile = { id: "a" };
  const generating = career.generateRecommendations();
  const catalog = career.loadCatalogs();
  career.logout();
  saveToken("b");
  career.store.profile = { id: "b" };
  career.store.recommendations = { employeeId: "b" };
  pending.resolve(envelope({ employeeId: "a" }));
  await assert.rejects(generating, { code: "SESSION_CHANGED" });
  await catalog;
  assert.equal(career.store.profile.id, "b");
  assert.equal(career.store.recommendations.employeeId, "b");
  assert.deepEqual(career.store.skills, []);
  career.logout();
  delete globalThis.useApi;
});

test("initial session validation is shared and cannot restore a user after logout", async () => {
  const pending = deferred();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.useRuntimeConfig = () => ({ public: { apiBase: "/api/v1" } });
  globalThis.useRouter = () => ({ replace: () => {} });
  globalThis.fetch = async () => {
    calls++;
    return pending.promise;
  };
  try {
    const { useApi } = await import("../app/composables/useApi.js");
    saveToken("restored");
    session.initialized = false;
    const api = useApi();
    const first = api.initializeAuth();
    const second = api.initializeAuth();
    assert.equal(calls, 1);
    clearSession();
    pending.resolve(
      reply(envelope({ id: "old-user", employeeId: "a", role: "EMPLOYEE" })),
    );
    await Promise.all([first, second]);
    assert.equal(session.user, null);
    assert.equal(session.token, "");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.useRuntimeConfig;
    delete globalThis.useRouter;
  }
});
