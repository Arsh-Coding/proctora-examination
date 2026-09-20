import path from 'node:path';
import dotenv from 'dotenv';

// Load `server/.env`, then fall back to a repo-root `.env` if present.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable "${name}" must be a number, received "${raw}".`);
  }
  return parsed;
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProduction = NODE_ENV === 'production';

/**
 * In development we default the secret so a fresh clone boots without setup friction.
 * In production a real secret is mandatory.
 */
const jwtSecret = isProduction
  ? required('JWT_SECRET')
  : required('JWT_SECRET', 'proctora-dev-secret-change-me');

export const env = {
  NODE_ENV,
  isProduction,
  PORT: num('PORT', 5000),
  MONGO_URI: required('MONGO_URI', 'mongodb://127.0.0.1:27017/proctora'),
  JWT_SECRET: jwtSecret,
  /** Admin login token lifetime. */
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '12h',
  /** Candidate exam-session token lifetime (long enough for the longest exam). */
  SESSION_TOKEN_EXPIRES_IN: process.env.SESSION_TOKEN_EXPIRES_IN ?? '24h',
  CLIENT_URL: process.env.CLIENT_URL ?? 'http://localhost:5173',
  /** Extra allowed origins, comma separated. */
  EXTRA_ORIGINS: (process.env.EXTRA_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

/** Convenience origins for local work only; never trusted in production. */
const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'];

export const allowedOrigins = [
  env.CLIENT_URL,
  ...(isProduction ? [] : devOrigins),
  // Deploy-preview URLs change per build, so they have to be listed explicitly.
  ...env.EXTRA_ORIGINS,
].filter((value, index, all) => all.indexOf(value) === index);
