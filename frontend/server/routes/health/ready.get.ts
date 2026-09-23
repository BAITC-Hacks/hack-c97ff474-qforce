import { createError, defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  try {
    const response = await fetch(
      `${config.apiBase.replace(/\/$/, "")}/health/ready`,
      {
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) throw new Error("Backend is not ready");
    return { status: "ready" };
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: "Backend is not ready",
    });
  }
});
