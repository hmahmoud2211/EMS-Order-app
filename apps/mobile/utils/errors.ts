import { isAxiosError } from 'axios';

import i18n from '@/i18n';

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status = 0, details: unknown = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
    if (body?.error?.code) {
      return new ApiError(body.error.code, body.error.message ?? '', error.response?.status ?? 0, body.error.details);
    }
    if (error.code === 'ECONNABORTED') return new ApiError('TIMEOUT', '', 0);
    if (!error.response) return new ApiError('NETWORK_ERROR', '', 0);
    return new ApiError('HTTP_ERROR', error.message, error.response.status);
  }
  return new ApiError('UNKNOWN', error instanceof Error ? error.message : String(error));
}

/**
 * A readable, translated message. Server messages are already user-friendly English;
 * Arabic users get translations for known codes, falling back to the server message.
 */
export function errorMessage(error: unknown): string {
  const apiError = toApiError(error);
  const key = `errors.${apiError.code}`;
  const isLocalOnly = ['NETWORK_ERROR', 'TIMEOUT', 'UNKNOWN', 'HTTP_ERROR'].includes(apiError.code);
  if ((i18n.language === 'ar' || isLocalOnly || !apiError.message) && i18n.exists(key)) {
    return i18n.t(key);
  }
  return apiError.message || i18n.t('errors.UNKNOWN');
}

export function errorCode(error: unknown): string {
  return toApiError(error).code;
}
