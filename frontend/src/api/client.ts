const normalizeBaseUrl = (rawBaseUrl: string): string => {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    return "/api/v1";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const normalizeBackendBaseUrl = (rawBackendUrl?: string): string | null => {
  const trimmed = rawBackendUrl?.trim();
  if (!trimmed) {
    return null;
  }
  const backend = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  return backend.endsWith("/api/v1") ? backend : `${backend}/api/v1`;
};

const dedupe = (items: Array<string | null | undefined>): string[] => {
  const unique = new Set<string>();
  items.forEach((item) => {
    if (!item) {
      return;
    }
    unique.add(item);
  });
  return Array.from(unique);
};

const CONFIGURED_API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
const BACKEND_API_BASE = normalizeBackendBaseUrl(import.meta.env.VITE_BACKEND_URL);
const RUNTIME_HOST_API_BASE =
  typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8000/api/v1` : null;
const API_BASE_CANDIDATES = dedupe([CONFIGURED_API_BASE, BACKEND_API_BASE, RUNTIME_HOST_API_BASE]);
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000);

export const AUTH_TOKEN_KEY = "apz_auth_token";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  asForm?: boolean;
  responseType?: "json" | "blob" | "text";
  withAuth?: boolean;
  allowBaseFallback?: boolean;
  timeoutMs?: number;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const readErrorMessage = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text) {
    return `HTTP error ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as { detail?: string };
    return parsed.detail ?? text;
  } catch {
    return text;
  }
};

export const getAuthToken = (): string | null => localStorage.getItem(AUTH_TOKEN_KEY);

export const setAuthToken = (token: string | null): void => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers = new Headers();
  const token = getAuthToken();

  if (options.withAuth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body: BodyInit | undefined;
  if (options.asForm && options.body && typeof options.body === "object") {
    const search = new URLSearchParams();
    Object.entries(options.body as Record<string, string>).forEach(([key, value]) => {
      search.set(key, value);
    });
    body = search;
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set("Content-Type", "application/json");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const bases = options.allowBaseFallback ? API_BASE_CANDIDATES : [CONFIGURED_API_BASE];

  let lastError: unknown = null;

  for (let index = 0; index < bases.length; index += 1) {
    const base = bases[index];
    const hasMoreBases = index < bases.length - 1;

    const controller = new AbortController();
    const timerId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);

    try {
      const response = await fetch(`${base}${normalizedPath}`, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new ApiError(await readErrorMessage(response), response.status);
        const shouldRetryWithNextBase =
          options.allowBaseFallback && hasMoreBases && (response.status === 404 || response.status === 405);

        if (shouldRetryWithNextBase) {
          lastError = error;
          continue;
        }

        throw error;
      }

      if (options.responseType === "blob") {
        return (await response.blob()) as T;
      }
      if (options.responseType === "text") {
        return (await response.text()) as T;
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const isNetworkError = error instanceof TypeError;
      const shouldRetryWithNextBase = options.allowBaseFallback && hasMoreBases && (isAbort || isNetworkError);

      if (shouldRetryWithNextBase) {
        continue;
      }

      if (isAbort) {
        throw new ApiError(
          `Request timeout after ${Math.round(timeoutMs / 1000)}s. Check API URL and network connectivity.`,
          408,
        );
      }

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new ApiError(error.message, 0);
      }

      throw new ApiError("Unknown network error", 0);
    } finally {
      window.clearTimeout(timerId);
    }
  }

  if (lastError instanceof ApiError) {
    throw lastError;
  }
  if (lastError instanceof Error) {
    throw new ApiError(lastError.message, 0);
  }
  throw new ApiError("Unknown network error", 0);
};

export { ApiError };
