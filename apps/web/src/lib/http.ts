/**
 * Shared Studio HTTP client (axios).
 * One instance: base URL, cookies, JSON, FastAPI error unwrapping.
 * SSE streams stay on fetch (see api.streamExecutionEvents) — axios is the wrong tool there.
 */
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";

/** Browser must hit /studio-backend (Next rewrite) so the session cookie stays first-party. */
function resolveApiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (typeof window !== "undefined") {
    if (
      !env ||
      env.includes("127.0.0.1:8010") ||
      env.includes("localhost:8010")
    ) {
      return "/studio-backend";
    }
    return env;
  }
  return env || process.env.STUDIO_API_ORIGIN || "http://127.0.0.1:8010";
}

export const API_BASE = resolveApiBase();

/** Typed API failure with FastAPI `detail` when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  readonly path?: string;

  constructor(status: number, message: string, detail?: unknown, path?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.path = path;
  }
}

function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return null;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: unknown }>) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;
      const path = error.config?.url;
      throw new ApiError(
        status,
        detailMessage(detail, error.message || `Request failed (${status})`),
        detail,
        path,
      );
    }
    if (error.request) {
      throw new ApiError(0, "Studio API unreachable — is the backend running?");
    }
    throw error;
  },
);

/** GET that returns null on miss / offline (fixture fallbacks). */
export async function getOptional<T>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<T | null> {
  try {
    const { data } = await http.get<T>(path, config);
    return data;
  } catch {
    return null;
  }
}

export async function getJson<T>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await http.get<T>(path, config);
  return data;
}

export async function postJson<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await http.post<T>(path, body, config);
  return data;
}

export async function putJson<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await http.put<T>(path, body, config);
  return data;
}

export function absoluteApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
