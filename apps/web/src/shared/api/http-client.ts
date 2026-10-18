import { z } from 'zod';
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

const baseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1'
).replace(/\/$/u, '');

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    body?: unknown;
    token?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    signal?: AbortSignal;
    credentials?: 'include' | 'omit';
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'POST',
      credentials: options.credentials ?? 'include',
      cache: 'no-store',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
      headers: {
        ...(options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(body);
    throw new ApiError(
      response.status,
      error.success ? error.data.error.code : 'SERVER_ERROR',
    );
  }
  if (response.status === 204) return schema.parse(undefined);
  const body: unknown = await response.json().catch(() => null);
  const result = z
    .object({ success: z.literal(true), data: schema })
    .safeParse(body);
  if (!result.success) throw new ApiError(502, 'INVALID_RESPONSE');
  return result.data.data;
}
