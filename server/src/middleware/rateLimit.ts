import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const skipInDev = () => !env.isProduction && process.env.ENABLE_RATE_LIMIT !== 'true';

/** Tight limit on credential endpoints to slow brute-force attempts. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
  skip: skipInDev,
});

/** Candidates report violations frequently, so this ceiling is generous. */
export const violationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many violation reports.' },
  skip: skipInDev,
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInDev,
});
