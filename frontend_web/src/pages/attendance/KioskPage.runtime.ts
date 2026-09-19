import axios from "axios";
import { API_BASE_URL } from "../../constants/api";
import { csrfToken } from "../../../landing_next/shared/browser-session";
import { getAccessToken } from "../../utils/tokenService";
import { isDesktopKiosk } from "../../kiosk/desktopBridge";

export const kioskClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: !isDesktopKiosk(),
});

kioskClient.interceptors.request.use(async (config) => {
  const desktop = isDesktopKiosk();
  config.withCredentials = !desktop;
  const token = desktop ? null : getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (!desktop && !["get", "head", "options"].includes((config.method || "get").toLowerCase())) {
    config.headers["X-CSRFToken"] = await csrfToken(API_BASE_URL);
  }
  return config;
});

export const KIOSK_TOKEN_KEY = "ctk_kiosk_device_token";
export const KIOSK_PHARMACY_NAME_KEY = "ctk_kiosk_pharmacy_name";
export const KIOSK_PHARMACY_ID_KEY = "ctk_kiosk_pharmacy_id";
