import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

async function signIn(page) {
  await page.goto("/login");
  await page
    .getByLabel("Имя пользователя", { exact: true })
    .fill(process.env.E2E_HR_USERNAME || "hr");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(process.env.E2E_HR_PASSWORD || "change-this-demo-hr-password");
  const login = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const response = await login;
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  await expect(page).toHaveURL(/\/hr-dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Разрывы по навыкам", exact: true }),
  ).toBeVisible();
  return { Authorization: `Bearer ${data.accessToken}` };
}

async function api(page, path, headers) {
  const response = await page.request.get("/api/v1" + path, { headers });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("HR desktop displays real counts, paginates employees and opens a persistent deep link", async ({
  page,
}, testInfo) => {
  const headers = await signIn(page);
  const summary = await api(page, "/hr/overview", headers);
  const employeeMetric = page
    .locator(".metric")
    .filter({ has: page.getByText("Сотрудников", { exact: true }) });
  await expect(employeeMetric.locator(".value")).toHaveText(
    String(summary.data.employeeCount),
  );
  await page.screenshot({
    path: testInfo.outputPath("hr-dashboard-desktop.png"),
    fullPage: true,
  });

  const employees = await api(page, "/employees?page=1&pageSize=20", headers);
  expect(employees.data.length).toBeGreaterThan(0);
  await page.goto("/hr-people");
  await expect(
    page.getByRole("heading", { name: "Профили развития", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(employees.data.length);
  await expect(page.locator("tbody tr").first()).toContainText(
    employees.data[0].fullName,
  );
  if (employees.meta.total > 20) {
    const nextPage = await api(page, "/employees?page=2&pageSize=20", headers);
    await page.getByRole("button", { name: "Далее", exact: true }).click();
    await expect(page.locator("tbody tr").first()).toContainText(
      nextPage.data[0].id,
    );
    await expect(page.getByText("Страница 2", { exact: false })).toBeVisible();
  } else {
    await expect(
      page.getByRole("button", { name: "Далее", exact: true }),
    ).toBeDisabled();
  }

  const employee = employees.data[0];
  await page.goto("/hr-employee?id=" + encodeURIComponent(employee.id));
  await expect(
    page.getByRole("heading", { name: employee.fullName, level: 1 }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: employee.fullName, level: 1 }),
  ).toBeVisible();
});

test("HR exact department filter returns the backend empty state and recovers", async ({
  page,
}) => {
  const headers = await signIn(page);
  await page.goto("/hr-people");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const missing = "__E2E_MISSING_DEPARTMENT__";
  const empty = await api(page, "/employees?department=" + missing, headers);
  expect(empty.meta.total).toBe(0);
  await page
    .getByLabel("Подразделение: точное название", { exact: true })
    .fill(missing);
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(
    page.getByText("Сотрудники не найдены. Измените фильтры.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page
    .getByLabel("Подразделение: точное название", { exact: true })
    .fill("");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("import validates real multipart packages without changing employee data and reloads the saved report", async ({
  page,
}) => {
  const headers = await signIn(page);
  const before = await api(page, "/employees?page=1&pageSize=1", headers);
  const employee = before.data[0];
  await page.goto("/import");
  const input = page.getByLabel("Файлы для импорта", { exact: true });
  await input.setInputFiles({
    name: "employees.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await page
    .getByRole("button", { name: "1. Проверить пакет", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Пакет отклонён", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2. Применить импорт", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("table tbody tr")).not.toHaveCount(0);

  const previewId = "e2e-dry-run-" + Date.now();
  const validPackage = {
    employees: [
      {
        employee_id: previewId,
        full_name: "E2E Dry Run Only",
        role: employee.roleId,
        grade: employee.gradeId,
        department: employee.department,
        manager_id: null,
        hire_date: employee.hireDate,
        tenure_months: employee.tenureMonths,
        work_format: employee.workFormat,
        preferred_language: employee.preferredLanguage,
        career_goal: null,
        skills: {},
        last_review_date: employee.lastReviewDate,
      },
    ],
  };
  await input.setInputFiles({
    name: "employees.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(validPackage)),
  });
  await expect(page).toHaveURL(/\/import$/);
  await page
    .getByRole("button", { name: "1. Проверить пакет", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Проверка пройдена", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2. Применить импорт", exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveURL(/\/import\?run=[0-9a-f-]+$/);
  const runId = new URL(page.url()).searchParams.get("run");
  const stored = await api(page, "/imports/" + runId, headers);
  expect(stored.data.status).toBe("VALIDATED");
  expect(stored.data.dryRun).toBe(true);
  expect(stored.data.report.counts.create).toBeGreaterThan(0);
  const after = await api(page, "/employees?page=1&pageSize=1", headers);
  expect(after.meta.total).toBe(before.meta.total);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Проверка пройдена", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ID отчёта: " + runId, { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2. Применить импорт", exact: true }),
  ).toBeDisabled();
});

test("HR mobile dashboard, participation and import remain within the viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  for (const [path, ready] of [
    ["/hr-dashboard", "Разрывы по навыкам"],
    ["/hr-people", "Профили развития"],
    ["/hr-events", "Сводка по мероприятиям"],
    ["/import", "Добавить данные"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: ready, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(path.slice(1) + "-mobile.png"),
      fullPage: true,
    });
  }
});

test("an identical local fixture import persists its result and preserves existing employee records", async ({
  page,
}) => {
  const headers = await signIn(page);
  const before = await api(page, "/employees?page=1&pageSize=100", headers);
  await page.goto("/import");
  const fixture =
    process.env.E2E_IMPORT_FIXTURE ||
    fileURLToPath(
      new URL("../../../backend/data/fixtures/employees.json", import.meta.url),
    );
  await page
    .getByLabel("Файлы для импорта", { exact: true })
    .setInputFiles(fixture);
  await page
    .getByRole("button", { name: "1. Проверить пакет", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Проверка пройдена", exact: true }),
  ).toBeVisible();
  const validatedUrl = page.url();
  await page
    .getByRole("button", { name: "2. Применить импорт", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Импорт применён", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.url()).not.toBe(validatedUrl);
  const runId = new URL(page.url()).searchParams.get("run");
  const stored = await api(page, "/imports/" + runId, headers);
  expect(stored.data.status).toBe("APPLIED");
  expect(stored.data.dryRun).toBe(false);
  expect(stored.data.report.counts.create).toBe(0);
  expect(stored.data.report.counts.update).toBe(0);
  expect(stored.data.report.counts.skip).toBeGreaterThan(0);
  const after = await api(page, "/employees?page=1&pageSize=100", headers);
  expect(after.data).toEqual(before.data);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Импорт применён", exact: true }),
  ).toBeVisible();
});

test("HR server failure is visible and retry loads real data (injected transport failure)", async ({
  page,
}) => {
  await signIn(page);
  const pattern = "**/api/v1/employees?**";
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TEST_UNAVAILABLE",
        message: "E2E: каталог сотрудников недоступен",
        details: null,
        requestId: "e2e",
      }),
    }),
  );
  await page.goto("/hr-people");
  await expect(page.getByRole("alert")).toContainText(
    "E2E: каталог сотрудников недоступен",
  );
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});
