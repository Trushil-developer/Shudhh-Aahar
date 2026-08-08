import type { TFunction } from 'i18next';

export class AppError extends Error {
  code: string;
  params?: Record<string, string | number>;

  constructor(code: string, message: string, params?: Record<string, string | number>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
  }
}

export function translateError(err: unknown, t: TFunction): string {
  if (err instanceof AppError) {
    return t(`errors.${err.code}`, err.params);
  }
  return t('errors.generic');
}
