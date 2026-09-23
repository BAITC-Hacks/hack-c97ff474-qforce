export class ApiError extends Error {
  constructor(
    message,
    status = 0,
    code = "NETWORK_ERROR",
    details = null,
    requestId = null,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}
// JSON and multipart share one transport; successful HTTP still requires an API envelope.
export function createApiClient({
  baseURL,
  getToken,
  getSessionVersion = getToken,
  onUnauthorized,
  fetcher = fetch,
}) {
  async function request(
    path,
    { method = "GET", query = {}, body, headers = {}, auth = true } = {},
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "")
        params.set(key, String(value));
    }
    const url = `${baseURL.replace(/\/$/, "")}/${path.replace(/^\//, "")}${params.size ? `?${params}` : ""}`;
    const requestHeaders = new Headers(headers);
    const token = getToken();
    const sessionVersion = getSessionVersion();
    const assertCurrentSession = () => {
      if (
        auth &&
        (token !== getToken() || sessionVersion !== getSessionVersion())
      ) {
        throw new ApiError(
          "Сессия изменилась. Повторите действие в текущем профиле.",
          0,
          "SESSION_CHANGED",
        );
      }
    };
    if (auth && token) requestHeaders.set("Authorization", `Bearer ${token}`);
    requestHeaders.set("Accept", "application/json");
    const multipart =
      typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !multipart)
      requestHeaders.set("Content-Type", "application/json");
    let response;
    try {
      response = await fetcher(url, {
        method,
        headers: requestHeaders,
        body:
          body === undefined
            ? undefined
            : multipart
              ? body
              : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
    } catch {
      assertCurrentSession();
      throw new ApiError(
        "Сервер недоступен или не ответил вовремя. Повторите запрос.",
      );
    }
    assertCurrentSession();
    let result;
    try {
      result = await response.json();
    } catch {
      assertCurrentSession();
      if (response.status === 401 && auth) onUnauthorized();
      throw new ApiError(
        `Сервер вернул некорректный ответ (HTTP ${response.status}).`,
        response.status,
        "INVALID_RESPONSE",
      );
    }
    assertCurrentSession();
    if (!response.ok) {
      if (response.status === 401 && auth) onUnauthorized();
      const message =
        response.status === 401
          ? "Сессия истекла или данные входа неверны. Войдите снова."
          : response.status === 403
            ? "У вашей учётной записи нет доступа к этому действию."
            : typeof result?.message === "string"
              ? result.message
              : `Ошибка запроса (HTTP ${response.status}).`;
      throw new ApiError(
        message,
        response.status,
        result?.code,
        result?.details,
        result?.requestId,
      );
    }
    if (
      !result ||
      typeof result !== "object" ||
      !Object.hasOwn(result, "data") ||
      !result.meta ||
      typeof result.meta !== "object" ||
      Array.isArray(result.meta)
    ) {
      throw new ApiError(
        "Ответ сервера не соответствует контракту API.",
        response.status,
        "INVALID_RESPONSE",
      );
    }
    return result;
  }
  async function allPages(path, query = {}) {
    const rows = [];
    for (let page = 1; ; page++) {
      const result = await request(path, {
        query: { ...query, page, pageSize: 100 },
      });
      if (
        !Array.isArray(result.data) ||
        !Number.isInteger(result.meta.total) ||
        result.meta.total < 0
      ) {
        throw new ApiError(
          "Некорректная пагинация в ответе сервера.",
          200,
          "INVALID_RESPONSE",
        );
      }
      rows.push(...result.data);
      if (rows.length >= result.meta.total) return rows;
      if (result.data.length === 0)
        throw new ApiError(
          "Сервер вернул неполную страницу данных. Повторите запрос.",
          200,
          "INVALID_RESPONSE",
        );
    }
  }
  return { request, allPages };
}
