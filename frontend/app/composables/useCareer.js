import { reactive } from "vue";
import { session, clearSession, onSessionChange } from "../utils/session.js";
import { apiLocale, adoptPreferredLocale, catalogText, uiError } from '../utils/i18n.js';
import { ApiError } from "../utils/api-client.js";

const store = reactive({
  get user() {
    return session.user;
  },
  profile: null,
  trajectory: null,
  history: [],
  recommendations: null,
  skills: [],
  roles: [],
  grades: [],
  activities: [],
  eligible: null,
  loading: false,
  error: "",
  toast: "",
  lastCompletion: null,
  blockErrors: {},
  blockLoading: {},
});
let timer;
let loadVersion = 0;
let catalogVersion = 0;
export function resetCareer() {
  ++loadVersion;
  ++catalogVersion;
  clearTimeout(timer);
  Object.assign(store, {
    profile: null,
    trajectory: null,
    history: [],
    recommendations: null,
    skills: [],
    roles: [],
    grades: [],
    activities: [],
    eligible: null,
    lastCompletion: null,
    blockErrors: {},
    blockLoading: {},
    error: "",
    loading: false,
    toast: "",
  });
}
onSessionChange(resetCareer);
export function useCareer() {
  const { request, allPages } = useApi();
  function notify(message) {
    store.toast = message;
    clearTimeout(timer);
    timer = setTimeout(() => {
      store.toast = "";
    }, 5000);
  }
  async function loadCatalogs() {
    const version = ++catalogVersion,
      sessionVersion = session.version;
    const [skills, roles, activities] = await Promise.all([
      request("/skills", { query: { locale: apiLocale() } }),
      request("/roles", { query: { locale: apiLocale() } }),
      allPages("/activities", { locale: apiLocale() }),
    ]);
    if (version === catalogVersion && sessionVersion === session.version) {
      store.skills = skills.data;
      store.roles = roles.data;
      store.activities = activities;
    }
  }
  async function loadBlock(key, id = store.profile?.id, version = loadVersion) {
    if (!id) return;
    const sessionVersion = session.version;
    const current = () => version === loadVersion && sessionVersion === session.version && store.profile?.id === id;
    const path = `/employees/${encodeURIComponent(id)}`;
    // Read first, commit only if both the employee and the session are still current.
    const readers = {
      history: () => allPages(`${path}/history`),
      recommendations: async () => {
        const selected = await request(`${path}/recommendations/latest`, { query: { locale: apiLocale() } });
        // A language switch can reuse saved evidence in another language.
        // Rendering translates the same facts without a new model call.
        return selected.data === null ? (await request(`${path}/recommendations/latest`)).data : selected.data;
      },
      eligible: async () => (await request(`${path}/eligible-activities`)).data,
      grades: async () => (await request(`/roles/${encodeURIComponent(store.profile.roleId)}/grades`, { query: { locale: apiLocale() } })).data,
      catalogs: loadCatalogs,
    };
    if (!readers[key] || !current()) return;
    store.blockLoading[key] = true;
    store.blockErrors[key] = '';
    try {
      const data = await readers[key]();
      if (current() && key !== 'catalogs') store[key] = data;
    } catch (cause) {
      if (current()) store.blockErrors[key] = uiError(cause);
    } finally {
      if (current()) store.blockLoading[key] = false;
    }
  }
  async function loadEmployee(id = session.user?.employeeId, { waitForOptional = true } = {}) {
    if (!id) return;
    const version = ++loadVersion;
    const sessionVersion = session.version;
    const current = () => version === loadVersion && sessionVersion === session.version;
    Object.assign(store, { loading: true, error: '', profile: null, trajectory: null, history: [], recommendations: null, eligible: null, grades: [], blockErrors: {}, blockLoading: {} });
    const path = `/employees/${encodeURIComponent(id)}`;
    try {
      const [profile, trajectory] = await Promise.all([request(path), request(`${path}/trajectory`)]);
      if (!current()) return;
      if (session.user?.role === 'EMPLOYEE') adoptPreferredLocale(profile.data.preferredLanguage);
      Object.assign(store, { profile: profile.data, trajectory: trajectory.data, loading: false });
      const optional = Promise.all(['history', 'recommendations', 'eligible', 'grades', 'catalogs'].map(key => loadBlock(key, id, version)));
      if (waitForOptional) await optional;
    } catch (error) {
      if (current()) store.error = uiError(error);
    } finally {
      if (current()) store.loading = false;
    }
  }
  async function generateRecommendations() {
    const id = store.profile?.id;
    if (!id) throw new Error("Сначала загрузите профиль.");
    const version = loadVersion,
      sessionVersion = session.version;
    const result = await request(
      `/employees/${encodeURIComponent(id)}/recommendations`,
      {
        method: "POST",
        body: { locale: apiLocale(), force: true },
      },
    );
    if (
      version !== loadVersion ||
      sessionVersion !== session.version ||
      store.profile?.id !== id
    ) {
      throw new ApiError(
        "Профиль изменился. Обновите рекомендации для текущего сотрудника.",
        0,
        "SESSION_CHANGED",
      );
    }
    store.recommendations = result.data;
    store.blockErrors.recommendations = '';
    return result.data;
  }
  function logout() {
    clearSession();
  }
  return {
    store,
    loadEmployee,
    loadBlock,
    loadCatalogs,
    generateRecommendations,
    logout,
    notify,
    skillName: (id) => catalogText(store.skills.find((s) => s.id === id), "name", id),
    roleName: (id) => catalogText(store.roles.find((r) => r.id === id), "name", id),
    gradeName: (id) =>
      catalogText(store.grades.find((g) => g.id === id), "name", id ?? "Не определён"),
    activityName: (id) =>
      catalogText(store.activities.find((a) => a.id === id), "title", id),
  };
}
