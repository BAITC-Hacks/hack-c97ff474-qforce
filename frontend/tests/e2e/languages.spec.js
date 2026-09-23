import { test, expect } from "@playwright/test";
import messages from "../../app/locales/messages.json" with { type: "json" };

const languages = ["de", "en", "ru", "zh", "kk", "pt", "es"];
const label = (key, locale) => messages[key]?.[locale] ?? key;

test("all seven login languages preserve typed credentials, persist and synchronize across tabs", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  const selector = page.getByTestId("language-select");
  expect(await selector.locator("option").evaluateAll((options) => options.map((option) => option.value))).toEqual(languages);
  await page.locator("#username").fill("typed-user-before-language-change");
  await page.locator("#password").fill("typed-password-before-language-change");
  for (const locale of languages) {
    await selector.selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { name: label("Добро пожаловать", locale), exact: true })).toBeVisible();
    await expect(page.locator("#username")).toHaveValue("typed-user-before-language-change");
    await expect(page.locator("#password")).toHaveValue("typed-password-before-language-change");
    expect(await page.evaluate(() => localStorage.getItem("qcareer-locale"))).toBe(locale);
  }

  const otherTab = await context.newPage();
  otherTab.on("pageerror", (error) => errors.push(error.message));
  await otherTab.goto("/login");
  await expect(otherTab.getByTestId("language-select")).toHaveValue("es");
  await otherTab.getByTestId("language-select").selectOption("de");
  await expect(selector).toHaveValue("de");
  await expect(page.getByRole("heading", { name: label("Добро пожаловать", "de"), exact: true })).toBeVisible();
  await expect(page.locator("#username")).toHaveValue("typed-user-before-language-change");
  await expect(page.locator("#password")).toHaveValue("typed-password-before-language-change");
  await page.reload();
  await expect(selector).toHaveValue("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  expect(errors).toEqual([]);
});

test("employee language changes localize the UI while catalogs and recommendation generation use supported API locales", async ({ page }) => {
  const errors = [], rejectedResponses = [], invalidLocales = [];
  let generationRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/v1/") && response.status() >= 400)
      rejectedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/v1/")) return;
    if (url.pathname.endsWith("/recommendations") && request.method() === "POST") generationRequests++;
    const locale = url.searchParams.get("locale");
    if (locale && !["ru", "en", "kk"].includes(locale)) invalidLocales.push(locale);
  });
  await page.goto("/login");
  await page.locator("#username").fill(process.env.E2E_EMPLOYEE_USERNAME || "employee");
  await page.locator("#password").fill(process.env.E2E_EMPLOYEE_PASSWORD || "change-this-demo-employee-password");
  const login = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login"));
  await page.locator('button[type="submit"]').click();
  expect((await login).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Establish a saved RU set so the test also works when run on its own.
  await page.goto("/recommendations");
  await page.getByTestId("language-select").selectOption("ru");
  const initialButton = page.getByRole("button", { name: label("Подобрать заново", "ru"), exact: true });
  await expect(initialButton).toBeEnabled();
  const initialGeneration = page.waitForResponse((response) => response.url().endsWith("/recommendations") && response.request().method() === "POST");
  await initialButton.click();
  const initialResponse = await initialGeneration;
  expect(initialResponse.ok()).toBeTruthy();
  const initialSet = (await initialResponse.json()).data;
  expect(initialSet.aiUsed, "This suite runs on fixtures with AI disabled").toBe(false);
  let savedCount = initialSet.recommendations.length;
  expect(savedCount).toBeGreaterThan(0);
  await expect(page.locator(".rec-card")).toHaveCount(savedCount);

  for (const locale of ["en", "zh", "de", "ru", "kk"]) {
    const expectedApiLocale = ["ru", "kk"].includes(locale) ? locale : "en";
    const generationCountBeforeSwitch = generationRequests;
    const latest = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/recommendations/latest") && url.searchParams.get("locale") === expectedApiLocale;
    });
    await page.getByTestId("language-select").selectOption(locale);
    const latestResponse = await latest;
    expect(latestResponse.ok()).toBeTruthy();
    const selectedSet = (await latestResponse.json()).data;
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { name: label("Следующий шаг с объяснением", locale), exact: true })).toBeVisible();
    // The enabled button means the latest request (including any read-only
    // fallback to a previously saved language) has finished loading.
    await expect(page.getByRole("button", { name: label("Подобрать заново", locale), exact: true })).toBeEnabled();
    // An existing locale-specific set may be older than the latest set in
    // another language. When absent, the last saved cards must remain available.
    const displayedCount = selectedSet?.recommendations.length ?? savedCount;
    expect(displayedCount).toBeGreaterThan(0);
    await expect(page.locator(".rec-card")).toHaveCount(displayedCount);
    expect(generationRequests, "Changing language must not regenerate recommendations").toBe(generationCountBeforeSwitch);
    if (selectedSet === null) {
      const feedback = page.waitForResponse(response => response.url().endsWith('/feedback') && response.request().method() === 'POST');
      await page.getByRole('button', { name: label('Полезно', locale), exact: true }).first().click();
      expect((await feedback).ok()).toBeTruthy();
      await expect(page.getByRole('button', { name: label('Полезно', locale), exact: true }).first()).toBeEnabled();
      await expect(page.locator('.rec-card')).toHaveCount(displayedCount);
      expect(generationRequests, 'Rating a fallback set must not trigger generation').toBe(generationCountBeforeSwitch);
    }

    const catalog = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/activities" && url.searchParams.get("pageSize") === "9" && url.searchParams.get("locale") === expectedApiLocale;
    });
    await page.goto("/catalog");
    expect((await catalog).ok()).toBeTruthy();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { name: label("Каталог развития", locale), exact: true })).toBeVisible();
    await expect(page.locator(".rec-card").first()).toBeVisible();

    await page.goto("/recommendations");
    await expect(page.getByRole("heading", { name: label("Следующий шаг с объяснением", locale), exact: true })).toBeVisible();
    const regenerate = page.getByRole("button", { name: label("Подобрать заново", locale), exact: true });
    await expect(regenerate).toBeEnabled();
    const generated = page.waitForResponse((response) => response.url().endsWith("/recommendations") && response.request().method() === "POST");
    await regenerate.click();
    const response = await generated;
    expect(response.ok()).toBeTruthy();
    expect(response.request().postDataJSON().locale).toBe(expectedApiLocale);
    const result = (await response.json()).data;
    expect(result.locale).toBe(expectedApiLocale);
    expect(result.aiUsed, "This suite runs on fixtures with AI disabled").toBe(false);
    savedCount = result.recommendations.length;
    await expect(page.locator(".rec-card")).toHaveCount(result.recommendations.length);
  }
  expect(invalidLocales).toEqual([]);
  expect(rejectedResponses).toEqual([]);
  expect(errors).toEqual([]);
});
