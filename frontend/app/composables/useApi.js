import { ApiError, createApiClient } from "../utils/api-client.js";
import { session, clearSession, saveToken } from "../utils/session.js";
let initialization;
export function useApi() {
  const config = useRuntimeConfig();
  const router = useRouter();
  const client = createApiClient({
    baseURL: config.public.apiBase,
    getToken: () => session.token,
    getSessionVersion: () => session.version,
    onUnauthorized: () => {
      clearSession();
      session.error = "Сессия истекла. Войдите снова.";
      void router.replace("/login");
    },
  });
  async function initializeAuth() {
    if (session.initialized) return;
    if (initialization?.version === session.version)
      return initialization.promise;
    if (!session.token) {
      let token = "";
      try {
        token = sessionStorage.getItem("qcareer-access-token") || "";
      } catch {
        /* Storage may be unavailable. */
      }
      if (token) saveToken(token);
    }
    if (!session.token) {
      session.initialized = true;
      return;
    }
    const version = session.version;
    const entry = { version, promise: null };
    entry.promise = (async () => {
      try {
        const result = await client.request("/auth/me");
        if (version !== session.version) return;
        session.user = result.data;
        session.initialized = true;
        session.error = "";
      } catch (error) {
        if (version === session.version) session.error = error.message;
      } finally {
        if (initialization === entry) initialization = undefined;
      }
    })();
    initialization = entry;
    return entry.promise;
  }
  async function login(username, password) {
    const version = session.version;
    const result = await client.request("/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    });
    if (version !== session.version)
      throw new ApiError(
        "Сессия изменилась. Повторите вход.",
        0,
        "SESSION_CHANGED",
      );
    saveToken(result.data.accessToken);
    session.user = result.data.user;
    session.initialized = true;
    session.error = "";
    return session.user;
  }
  return { ...client, session, initializeAuth, login };
}
