export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_PATH = '/api/v1';
const ABSOLUTE_API_PATHS = [/^\/api\/auth(?:\/|$)/, /^\/api\/device(?:\/|$)/];

function resolveApiPath(path: string): string {
  if (/^https?:\/\//i.test(path) || ABSOLUTE_API_PATHS.some((pattern) => pattern.test(path))) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_PATH}${normalizedPath}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body?.error?.code ?? 'REQUEST_FAILED';
    const message = body?.error?.message ?? `Request failed (${response.status})`;
    throw new ApiError(code, message, response.status);
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(resolveApiPath(path), { credentials: 'include' });
  return parseResponse<T>(response);
}

export async function apiPut<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  return parseResponse<T>(response);
}

export async function apiPatch<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, payload: unknown = {}): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  return parseResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(resolveApiPath(path), { method: 'DELETE', credentials: 'include' });
  return parseResponse<T>(response);
}
