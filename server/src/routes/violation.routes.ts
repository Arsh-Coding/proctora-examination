import { Router } from 'express';
import { createViolation, createViolationSchema } from '../controllers/violation.controller';
import { requireSession } from '../middleware/auth';
import { violationLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';

const router = Router();

router.post(
  '/',
  violationLimiter,
  requireSession,
  validate(createViolationSchema),
  createViolation
);

export default router;
