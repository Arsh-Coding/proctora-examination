import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { adminTokenStore } from '../utils/storage';

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';
export const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5000';

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  details?: Array<{ field: string; message: string }>;
  data: T;
}

/** Error surfaced to the UI: always has a human-readable `message`. */
export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly fieldErrors: Array<{ field: string; message: string }>;
  public readonly payload: unknown;

  constructor(
    message: string,
    status: number,
    fieldErrors: Array<{ field: string; message: string }> = [],
    payload?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.payload = payload;
  }
}

function toApiError(error: unknown): ApiRequestError {
  const axiosError = error as AxiosError<{ message?: string; details?: unknown }>;

  if (axiosError?.response) {
    const { status, data } = axiosError.response;
    const details = Array.isArray(data?.details)
      ? (data.details as Array<{ field: string; message: string }>)
      : [];
    return new ApiRequestError(
      data?.message ?? `Request failed with status ${status}`,
      status,
      details,
      data
    );
  }

  if (axiosError?.request) {
    return new ApiRequestError(
      'Cannot reach the PROCTORA API. Is the server running on ' + API_BASE_URL + '?',
      0
    );
  }

  return new ApiRequestError((error as Error)?.message ?? 'Unexpected error', 0);
}

/** Admin client: automatically carries the stored admin JWT. */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = adminTokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Expired/invalid admin token: let the auth layer clear state and redirect.
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
      onUnauthorized?.();
    }
    return Promise.reject(toApiError(error));
  }
);

/** Plain client for candidate + public calls (no admin token attached). */
export const publicApi: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

publicApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(toApiError(error))
);

/** Unwraps the `{ success, data }` envelope the API always returns. */
export async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  const response = await promise;
  return response.data.data;
}

export function withSessionToken(token: string): AxiosRequestConfig {
  return { headers: { Authorization: `Bearer ${token}` } };
}
