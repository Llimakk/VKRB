/**
 * Базовый URL админ-API (:8000). Переопределение: ?api=http://127.0.0.1:8000
 */
function resolveApiBase() {
  try {
    const q = new URLSearchParams(window.location.search).get("api");
    if (q) return q.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  const host = window.location.hostname || "127.0.0.1";
  let protocol = window.location.protocol;
  if (protocol === "file:" || protocol === "blob:") protocol = "http:";
  return `${protocol}//${host}:8000`;
}

export const API_BASE = resolveApiBase();

if (typeof window !== "undefined" && window.location.protocol === "file:") {
  console.warn(
    "[VKRB] Откройте админку через HTTP: python -m http.server 5173 --directory frontend → http://localhost:5173",
  );
}
