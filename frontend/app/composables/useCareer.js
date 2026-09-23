import { reactive } from "vue";
import { session, clearSession, onSessionChange } from "../utils/session.js";
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
      request("/skills", { query: { locale: "ru" } }),
      request("/roles", { query: { locale: "ru" } }),
      allPages("/activities", { locale: "ru" }),
    ]);
    if (version === catalogVersion && sessionVersion === session.version) {
      store.skills = skills.data;
      store.roles = roles.data;
      store.activities = activities;
    }
  }
  async function loadEmployee(id = session.user?.employeeId) {
    if (!id) return;
    const version = ++loadVersion;
    const sessionVersion = session.version;
    store.loading = true;
    store.error = "";
    store.profile = null;
    store.trajectory = null;
    store.history = [];
    store.recommendations = null;
    store.eligible = null;
    const path = `/employees/${encodeURIComponent(id)}`;
    try {
      const [profile, trajectory, history, recommendations, eligible] =
        await Promise.all([
          request(path),
          request(`${path}/trajectory`),
          allPages(`${path}/history`),
          request(`${path}/recommendations/latest`, {
            query: { locale: "ru" },
          }),
          request(`${path}/eligible-activities`),
          loadCatalogs(),
        ]);
      if (version !== loadVersion || sessionVersion !== session.version) return;
      const grades = await request(
        `/roles/${encodeURIComponent(profile.data.roleId)}/grades`,
      );
      if (version !== loadVersion || sessionVersion !== session.version) return;
      Object.assign(store, {
        profile: profile.data,
        trajectory: trajectory.data,
        history,
        recommendations: recommendations.data,
        eligible: eligible.data,
        grades: grades.data,
      });
    } catch (error) {
      if (version === loadVersion) store.error = error.message;
    } finally {
      if (version === loadVersion) store.loading = false;
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
        body: { locale: "ru", force: true },
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
    return result.data;
  }
  function logout() {
    clearSession();
  }
  return {
    store,
    loadEmployee,
    loadCatalogs,
    generateRecommendations,
    logout,
    notify,
    skillName: (id) => store.skills.find((s) => s.id === id)?.name ?? id,
    roleName: (id) => store.roles.find((r) => r.id === id)?.name ?? id,
    gradeName: (id) =>
      store.grades.find((g) => g.id === id)?.name ?? id ?? "Не определён",
    activityName: (id) =>
      store.activities.find((a) => a.id === id)?.title ?? id,
  };
}
