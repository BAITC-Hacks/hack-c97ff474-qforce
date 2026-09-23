export default defineNuxtRouteMiddleware(async (to) => {
  const { session, initializeAuth } = useApi();
  if (["/login", "/register", "/ui-kit", "/screens"].includes(to.path)) return;
  await initializeAuth();
  if (!session.user) return navigateTo("/login");
  if (
    (to.path.startsWith("/hr-") || to.path === "/import") &&
    session.user.role !== "HR"
  )
    return navigateTo("/forbidden");
  if (
    session.user.role === "HR" &&
    [
      "/",
      "/dashboard",
      "/profile",
      "/path",
      "/recommendations",
      "/activities",
      "/catalog",
      "/completion",
    ].includes(to.path)
  )
    return navigateTo("/hr-dashboard");
});
