export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function throwDatabaseError(error, message = 'Database operation failed.') {
  if (error) {
    console.error(message, error);
    throw new AppError(500, 'DATABASE_ERROR', message);
  }
}
