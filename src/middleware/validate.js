import { AppError } from '../utils/errors.js';

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? 'Invalid input.'));
    }

    req.validated ??= {};
    req.validated[source] = result.data;
    next();
  };
}
