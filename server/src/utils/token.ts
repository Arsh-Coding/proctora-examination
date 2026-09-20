import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';

export interface AdminTokenPayload {
  kind: 'ADMIN';
  sub: string;
  email: string;
  role: 'ADMIN';
}

export interface SessionTokenPayload {
  kind: 'SESSION';
  /** ExamSession id. */
  sub: string;
  examId: string;
}

export type TokenPayload = AdminTokenPayload | SessionTokenPayload;

function sign(payload: TokenPayload, expiresIn: string): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn } as SignOptions);
}

export function signAdminToken(payload: Omit<AdminTokenPayload, 'kind'>): string {
  return sign({ ...payload, kind: 'ADMIN' }, env.JWT_EXPIRES_IN);
}

export function signSessionToken(payload: Omit<SessionTokenPayload, 'kind'>): string {
  return sign({ ...payload, kind: 'SESSION' }, env.SESSION_TOKEN_EXPIRES_IN);
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
}

export function bearerFrom(header?: string): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim();
}
