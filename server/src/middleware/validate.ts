import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError';

type Source = 'body' | 'query' | 'params';

/** Validates and replaces `req[source]` with the parsed value. */
export function validate(schema: ZodType, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    // `req.query` is a getter in Express 5, so assign via defineProperty.
    if (source === 'query') {
      Object.defineProperty(req, 'query', { value: result.data, writable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid 24 character MongoDB id');
