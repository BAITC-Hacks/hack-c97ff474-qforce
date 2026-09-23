import { reactive } from "vue";
export const session = reactive({
  token: "",
  user: null,
  initialized: false,
  error: "",
  version: 0,
});
const listeners = new Set();
export function onSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function changed() {
  session.version++;
  for (const listener of listeners) listener();
}
export function clearSession() {
  session.token = "";
  session.user = null;
  session.initialized = true;
  session.error = "";
  changed();
  try {
    sessionStorage.removeItem("qcareer-access-token");
  } catch {
    /* In-memory session remains usable. */
  }
}
export function saveToken(token) {
  session.token = token;
  session.user = null;
  session.error = "";
  changed();
  try {
    sessionStorage.setItem("qcareer-access-token", token);
  } catch {
    /* Reload will require login. */
  }
}
