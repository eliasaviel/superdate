const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK || "true").toLowerCase() === "true";

export const api = USE_MOCK
  ? await import("./mockApi").then(m => m.api)
  : await import("./realApi").then(m => m.api);
