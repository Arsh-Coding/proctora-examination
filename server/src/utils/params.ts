import type { Request } from 'express';
import { ApiError } from './ApiError';

/**
 * Express 5 types route params as `string | string[]`. Route schemas already
 * validate the shape, so this narrows to a single string safely.
 */
export function routeParam(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  const single = Array.isArray(value) ? value[0] : value;
  if (!single) throw ApiError.badRequest(`Missing route parameter "${name}"`);
  return single;
}
