// Toggle backend usage
export const USE_MOCK_API = true;

// Backend base URL (used only when USE_MOCK_API = false)
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
