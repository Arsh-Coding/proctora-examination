import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User';
import type { UserRole } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { bearerFrom, verifyToken } from '../utils/token';

/** Requires a valid admin JWT (`Authorization: Bearer <token>`). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerFrom(req.headers.authorization);
    if (!token) throw ApiError.unauthorized('Missing bearer token');

    const payload = verifyToken(token);
    if (payload.kind !== 'ADMIN') {
      throw ApiError.forbidden('This endpoint requires a staff account token');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('Account no longer exists');

    req.admin = user;
    next();
  } catch (error) {
    next(error);
  }
}

/** Role gate, used after `requireAuth`. */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(ApiError.unauthorized());
    if (!roles.includes(req.admin.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

/**
 * Requires a candidate exam-session token. Candidates never create accounts, so
 * the token minted at exam start is what authorises answer saves, submission and
 * violation reports for that one session.
 */
export function requireSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerFrom(req.headers.authorization) ?? (req.headers['x-session-token'] as string | undefined);
    if (!token) throw ApiError.unauthorized('Missing exam session token');

    const payload = verifyToken(token);
    if (payload.kind !== 'SESSION') {
      throw ApiError.forbidden('This endpoint requires an exam session token');
    }

    // When the route carries a session id it must match the token subject.
    const rawRouteId = req.params.sessionId ?? req.params.id;
    const routeId = Array.isArray(rawRouteId) ? rawRouteId[0] : rawRouteId;
    if (routeId && routeId !== payload.sub) {
      throw ApiError.forbidden('Session token does not match the requested session');
    }

    req.sessionToken = payload;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Accepts either an admin token or a session token. Used by read endpoints that
 * both roles need (the controller then decides how much to reveal).
 */
export async function requireAdminOrSession(req: Request, res: Response, next: NextFunction) {
  const token = bearerFrom(req.headers.authorization) ?? (req.headers['x-session-token'] as string | undefined);
  if (!token) return next(ApiError.unauthorized('Missing token'));
  try {
    const payload = verifyToken(token);
    if (payload.kind === 'ADMIN') return requireAuth(req, res, next);
    return requireSession(req, res, next);
  } catch (error) {
    return next(error);
  }
}
