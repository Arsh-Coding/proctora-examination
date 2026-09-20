import { Router } from 'express';
import { z } from 'zod';
import {  
  getAdminSession,
  getCandidateSession,
  getSessionViolations,
  heartbeat,
  listAllSessions,
  saveAnswers,
  saveAnswersSchema,
  submitCandidateSession,
  submitSchema,
} from '../controllers/session.controller';
import { authorize, requireAdminOrSession, requireAuth, requireSession } from '../middleware/auth';
import { objectIdSchema, validate } from '../middleware/validate';

const router = Router();
const idParams = z.object({ id: objectIdSchema });
const sessionIdParams = z.object({ sessionId: objectIdSchema });

/* -------- candidate routes (authorised by the exam session token) -------- */

/** Restore an in-flight attempt after refresh/crash. */
router.get('/me', requireSession, getCandidateSession);

router.patch(
  '/:sessionId/answers',
  validate(sessionIdParams, 'params'),
  requireSession,
  validate(saveAnswersSchema),
  saveAnswers
);

router.post(
  '/:sessionId/submit',
  validate(sessionIdParams, 'params'),
  requireSession,
  validate(submitSchema),
  submitCandidateSession
);

router.post(
  '/:sessionId/heartbeat',
  validate(sessionIdParams, 'params'),
  requireSession,
  heartbeat
);

/* ------------------------------ shared read ------------------------------ */

router.get(
  '/:id/violations',
  validate(idParams, 'params'),
  requireAdminOrSession,
  getSessionViolations
);

/* ------------------------------ admin routes ----------------------------- */

router.get('/', requireAuth, authorize('ADMIN'), listAllSessions);
router.get('/:id', validate(idParams, 'params'), requireAuth, authorize('ADMIN'), getAdminSession);

export default router;
