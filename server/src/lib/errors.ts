/** Erreur métier portant une clé i18n et un code HTTP. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorKey: string,
  ) {
    super(errorKey);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'error.unauthorized'),
  validation: () => new AppError(400, 'error.validation'),
  codeInvalid: () => new AppError(404, 'error.codeInvalid'),
  sessionClosed: () => new AppError(409, 'error.sessionClosed'),
  sessionNotStarted: () => new AppError(409, 'error.sessionNotStarted'),
  sessionLocked: () => new AppError(423, 'error.sessionLocked'),
  notFound: () => new AppError(404, 'error.codeInvalid'),
  conflict: (key = 'error.validation') => new AppError(409, key),
  rateLimited: () => new AppError(429, 'error.rateLimited'),
};
