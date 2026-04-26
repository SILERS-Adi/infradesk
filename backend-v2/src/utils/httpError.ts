export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'HttpError';
  }

  static badRequest(message: string, code = 'bad_request', details?: unknown): HttpError {
    return new HttpError(400, code, message, details);
  }
  static unauthorized(message = 'Unauthorized', code = 'unauthorized'): HttpError {
    return new HttpError(401, code, message);
  }
  static forbidden(message = 'Forbidden', code = 'forbidden'): HttpError {
    return new HttpError(403, code, message);
  }
  static notFound(message = 'Not found', code = 'not_found'): HttpError {
    return new HttpError(404, code, message);
  }
  static conflict(message: string, code = 'conflict'): HttpError {
    return new HttpError(409, code, message);
  }
  static tooMany(message = 'Too many requests', code = 'rate_limited'): HttpError {
    return new HttpError(429, code, message);
  }
  static internal(message = 'Internal server error', code = 'internal'): HttpError {
    return new HttpError(500, code, message);
  }
}
