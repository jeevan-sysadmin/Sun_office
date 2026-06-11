const normalizeApiBaseUrl = (value?: string): string => {
  const rawValue = value?.trim();
  if (!rawValue) {
    return "";
  }

  return rawValue.replace(/\/+$/, "");
};

const fallbackApiBaseUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/sun_office/api`
    : "http://cloud.anyrdp.in:3000/sun_office/api";

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL || fallbackApiBaseUrl
);

export const buildApiUrl = (path: string): string =>
  `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;

export const WATER_SERVICES_URL = buildApiUrl("water_services.php");
export const LOGIN_URL = buildApiUrl("login.php");
