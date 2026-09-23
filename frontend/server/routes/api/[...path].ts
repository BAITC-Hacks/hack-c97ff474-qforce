import { defineEventHandler, getRequestURL, proxyRequest } from "h3";

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event);
  const request = getRequestURL(event);
  // Keep the backend's /api/v1 prefix and query string. Only the trusted
  // server-side origin is configurable; the browser cannot choose a host.
  const target = `${config.apiBase.replace(/\/$/, "")}${request.pathname}${request.search}`;
  return proxyRequest(event, target);
});
