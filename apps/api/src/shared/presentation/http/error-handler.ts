import type { ErrorRequestHandler } from 'express';
import { ApplicationError } from '../../domain/application-error.js';
import type { ApplicationErrorCode } from '../../domain/application-error.js';

const applicationStatuses: Record<ApplicationErrorCode, number> = {
  GOOGLE_INVALID_CREDENTIALS: 401,
  GOOGLE_UNAVAILABLE: 503,
  GOOGLE_ACCOUNT_CONFLICT: 409,
  GOOGLE_EMAIL_NOT_AUTHORITATIVE: 422,
  PASSWORD_SIGN_IN_CONFIRMATION_REQUIRED: 403,
  PASSWORD_NOT_SET: 422,
  CURRENT_PASSWORD_INCORRECT: 422,
  RATE_LIMITED: 429,
  PROFILE_CONFLICT: 409,
  WORKSPACE_CONFLICT: 409,
  RECOVERY_INVALID: 422,
  RECOVERY_UNAVAILABLE: 503,
  NOTIFICATION_CONFLICT: 409,
  NOTIFICATION_NOT_FOUND: 404,
  PORTAL_CONFLICT: 409,
  PORTAL_SHARE_UNAVAILABLE: 404,
  PAYMENT_INVOICE_NOT_FOUND: 404,
  PAYMENT_INVOICE_LOCKED: 409,
  PAYMENT_NOT_FOUND: 404,
  PAYMENT_CONFLICT: 409,
  PAYMENT_REQUEST_CONFLICT: 409,
  PAYMENT_OVERPAYMENT: 422,
  PAYMENT_LIMIT_REACHED: 422,
  INVOICE_CONFLICT: 409,
  INVOICE_LOCKED: 409,
  INVOICE_NOT_ISSUED: 409,
  INVOICE_SHARE_UNAVAILABLE: 404,
  INVOICE_NOT_FOUND: 404,
  INVOICE_CLIENT_UNAVAILABLE: 422,
  INVOICE_PROJECT_UNAVAILABLE: 422,
  INVOICE_REQUEST_CONFLICT: 409,
  INVOICE_NUMBER_EXHAUSTED: 409,
  PROPOSAL_NOT_FOUND: 404,
  PROPOSAL_DECISION_CONFLICT: 409,
  TASK_NOT_FOUND: 404,
  TASK_PROJECT_NOT_FOUND: 404,
  TASK_PROJECT_LOCKED: 409,
  TASK_CONFLICT: 409,
  TASK_LIMIT_REACHED: 422,
  TASK_POSITION_INVALID: 422,
  PROJECT_NOT_FOUND: 404,
  PROJECT_CLIENT_UNAVAILABLE: 422,
  PROJECT_CONFLICT: 409,
  PROJECT_STATUS_INVALID: 409,
  PROPOSAL_CLIENT_UNAVAILABLE: 422,
  PROPOSAL_CONFLICT: 409,
  PROPOSAL_LOCKED: 409,
  PROPOSAL_SHARE_UNAVAILABLE: 404,
  CLIENT_NOT_FOUND: 404,
  CLIENT_CONFLICT: 409,
  CLIENT_ARCHIVED: 409,
  VALIDATION_ERROR: 422,
  EMAIL_ALREADY_REGISTERED: 409,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  WORKSPACE_ACCESS_DENIED: 403,
  UNTRUSTED_ORIGIN: 403,
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApplicationError) {
    if (error.code === 'UNAUTHENTICATED')
      response.setHeader('WWW-Authenticate', 'Bearer');
    response.status(applicationStatuses[error.code]).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(Object.keys(error.fields).length > 0
          ? { fields: error.fields }
          : {}),
      },
    });
    return;
  }

  const malformedJson = error instanceof SyntaxError && 'body' in error;
  const tooLarge =
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large';

  const status = malformedJson ? 400 : tooLarge ? 413 : 500;
  const code = malformedJson
    ? 'INVALID_JSON'
    : tooLarge
      ? 'PAYLOAD_TOO_LARGE'
      : 'INTERNAL_ERROR';
  const message = malformedJson
    ? 'Request body must be valid JSON'
    : tooLarge
      ? 'Request body is too large'
      : 'An unexpected error occurred';

  response.status(status).json({ success: false, error: { code, message } });
};
