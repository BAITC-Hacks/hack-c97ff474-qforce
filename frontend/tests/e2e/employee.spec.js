import { test, expect } from "@playwright/test";

async function signIn(page) {
  await page.goto("/login");
  await page
    .getByLabel("Имя пользователя", { exact: true })
    .fill(process.env.E2E_EMPLOYEE_USERNAME || "employee");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(
      process.env.E2E_EMPLOYEE_PASSWORD || "change-this-demo-employee-password",
    );
  const login = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/auth/login"),
  );
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const response = await login;
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  await expect(
    page.getByRole("heading", {
      name: "Развивайтесь в своём темпе",
      exact: true,
    }),
  ).toBeVisible();
  return {
    headers: { Authorization: `Bearer ${data.accessToken}` },
    id: data.user.employeeId,
  };
}
async function get(page, path, headers) {
  const response = await page.request.get("/api/v1" + path, { headers });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data;
}

test("employee loads actual profile and recommendations, enrolls/completes and reloads persisted result", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { headers, id } = await signIn(page);
  const base = "/employees/" + encodeURIComponent(id);
  const before = await get(page, base, headers);
  await expect(
    page.getByText("Здравствуйте, " + before.fullName, { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("employee-desktop.png"),
    fullPage: true,
  });
  await page.goto("/recommendations");
  await expect(
    page.getByRole("button", { name: "Подобрать заново", exact: false }),
  ).toBeEnabled();
  const generation = page.waitForResponse(
    (response) =>
      response.url().endsWith(base + "/recommendations") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Подобрать заново", exact: false })
    .click();
  const generated = await generation;
  expect(generated.ok()).toBeTruthy();
  const set = (await generated.json()).data;
  await expect(page.locator(".rec-card")).toHaveCount(
    set.recommendations.length,
  );
  expect(set.recommendations.length, "Fresh fixture stack must return recommendations").toBeGreaterThan(0);
  {
    const feedback = page.waitForResponse((response) =>
      response.url().endsWith("/feedback"),
    );
    await page
      .getByRole("button", { name: "Полезно", exact: true })
      .first()
      .click();
    expect((await feedback).ok()).toBeTruthy();
    await expect(
      page.getByRole("status").filter({ hasText: "Обратная связь сохранена." }),
    ).toBeVisible();
  }
  const eligible = await get(page, base + "/eligible-activities", headers);
  const history = await get(page, base + "/history?pageSize=100", headers);
  const activity = eligible.eligible.find(
    (row) => row.activity.format === "self_paced",
  )?.activity;
  expect(activity, "Run this business-cycle test against a fresh isolated fixture stack").toBeTruthy();
  {
    await page.goto("/event?id=" + encodeURIComponent(activity.id));
    await expect(
      page.getByRole("heading", { name: activity.title, exact: true }),
    ).toBeVisible();
    await page.reload();
    const existing = history.find(
      (row) =>
        row.activityId === activity.id &&
        ["registered", "in_progress", "overdue"].includes(row.status),
    );
    let pid = existing?.id;
    if (!existing) {
      const registration = page.waitForResponse(
        (response) =>
          response.url().endsWith("/participations") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Записаться", exact: false })
        .click();
      const registered = await registration;
      expect(registered.ok()).toBeTruthy();
      pid = (await registered.json()).data.id;
    } else
      await page
        .getByRole("link", { name: "Открыть моё участие", exact: true })
        .click();
    await expect(page).toHaveURL(/\/activities$/);
    const row = page
      .locator(".activity-entry")
      .filter({
        has: page.getByRole("link", { name: activity.title, exact: true }),
      });
    await expect(row).toContainText(
      existing
        ? {
            registered: "Записан",
            in_progress: "В процессе",
            overdue: "Просрочено",
          }[existing.status]
        : "Записан",
    );
    const completion = page.waitForResponse((response) =>
      response.url().endsWith("/" + pid + "/complete"),
    );
    await row.getByRole("button", { name: "Завершить", exact: true }).click();
    const completed = await completion;
    expect(completed.ok()).toBeTruthy();
    const result = (await completed.json()).data;
    await expect(page).toHaveURL(/\/completion\?id=/);
    await expect(
      page.getByRole("heading", { name: activity.title, exact: true }),
    ).toBeVisible();
    const after = await get(page, base, headers);
    expect(after.trajectory).toEqual(result.trajectoryAfter);
    for (const change of result.changedSkills)
      expect(after.skills[change.skillId]).toBe(change.after);
    const duplicate = await page.request.post(
      "/api/v1" + base + "/participations/" + pid + "/complete",
      {
        headers: { ...headers, "Idempotency-Key": "browser-retry-" + pid },
        data: {},
      },
    );
    expect(duplicate.ok()).toBeTruthy();
    expect((await get(page, base, headers)).skills).toEqual(after.skills);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: activity.title, exact: true }),
    ).toBeVisible();
    expect(
      (await get(page, base + "/history?pageSize=100", headers)).find(
        (row) => row.id === pid,
      ).completionResult,
    ).toEqual(result);
    await page.screenshot({
      path: testInfo.outputPath("completion-desktop.png"),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("employee cannot access HR; invalid session expires on real API response", async ({
  page,
}) => {
  const { headers } = await signIn(page);
  expect(
    (await page.request.get("/api/v1/hr/overview", { headers })).status(),
  ).toBe(403);
  await page.goto("/hr-dashboard");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(
    page.getByRole("heading", { name: "Доступ ограничен", level: 1 }),
  ).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem("qcareer-access-token", "invalid-expired-token"),
  );
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Сессия истекла", { exact: false }),
  ).toBeVisible();
});

test("incorrect credentials show failure without authenticating", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Имя пользователя", { exact: true }).fill("employee");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("invalid-password-for-e2e");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("данные входа неверны");
  await expect(page).toHaveURL(/\/login$/);
});

test("empty catalog, real not-found, loading and injected service error recover visibly", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/catalog");
  await expect(page.locator(".rec-card").first()).toBeVisible();
  await page
    .getByLabel("Формат активности", { exact: true })
    .selectOption("online");
  await expect(
    page.getByText("Активностей с такими фильтрами нет.", { exact: true }),
  ).toBeVisible();
  await page.goto("/event?id=__missing_e2e_activity__");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.route("**/api/v1/employees/*/trajectory", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TEST_UNAVAILABLE",
        message: "Проверка недоступности сервера",
        details: null,
        requestId: "e2e",
      }),
    });
  });
  await page.goto("/path");
  await expect(
    page.getByRole("status").filter({ hasText: "Загружаем" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "TEST_UNAVAILABLE",
  );
  await page.unroute("**/api/v1/employees/*/trajectory");
  await page
    .getByRole("button", { name: "Повторить запрос", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ваш карьерный путь", exact: true }),
  ).toBeVisible();
});

test("failed enrollment shows an error and leaves saved history unchanged", async ({ page }) => {
  const { headers, id } = await signIn(page);
  const base = '/employees/' + encodeURIComponent(id);
  const history = await get(page, base + '/history?pageSize=100', headers);
  const activities = await get(page, '/activities?pageSize=100', headers);
  const activity = activities.find(item => item.format === 'self_paced' && !history.some(row => row.activityId === item.id && ['registered', 'in_progress', 'overdue'].includes(row.status)));
  expect(activity).toBeTruthy();
  await page.goto('/event?id=' + encodeURIComponent(activity.id));
  await expect(page.getByRole('button', { name: 'Записаться', exact: false })).toBeEnabled();
  await page.route('**/api/v1/employees/*/participations', route => route.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ code: 'TEST_CONFLICT', message: 'Участие не сохранено: проверка ошибки', details: null, requestId: 'e2e' }),
  }));
  await page.getByRole('button', { name: 'Записаться', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('Данные изменились или действие уже выполнено');
  await expect(page).toHaveURL(/\/event\?id=/);
  await expect(page.locator('.app-toast')).toHaveCount(0);
  expect(await get(page, base + '/history?pageSize=100', headers)).toEqual(history);
});

test("employee desktop and mobile routes have no overflow and keep navigation", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, title] of [
    ["/dashboard", "Развивайтесь в своём темпе"],
    ["/profile", "Мой профиль и навыки"],
    ["/path", "Ваш карьерный путь"],
    ["/catalog", "Каталог развития"],
    ["/activities", "Мои активности"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Загружаем данные…", { exact: true }),
    ).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow, path).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(path.slice(1) + "-mobile.png"),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/mobile-open/);
});
