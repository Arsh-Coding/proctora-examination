import { Router } from 'express';
import { z } from 'zod';
import {
  createExam,
  createExamSchema,
  deleteExam,
  getExam,
  getPublicExam,
  listExamSessions,
  listExams,
  startExam,
  startExamSchema,
  updateExam,
  updateExamSchema,
} from '../controllers/exam.controller';
import { authorize, requireAuth } from '../middleware/auth';
import { objectIdSchema, validate } from '../middleware/validate';

const router = Router();
const idParams = z.object({ id: objectIdSchema });

/* Public candidate routes (no account required). */
router.get('/:id/public', validate(idParams, 'params'), getPublicExam);
router.post('/:id/start', validate(idParams, 'params'), validate(startExamSchema), startExam);

/* Admin routes. */
router.use(requireAuth, authorize('ADMIN'));

router.route('/').get(listExams).post(validate(createExamSchema), createExam);

router
  .route('/:id')
  .get(validate(idParams, 'params'), getExam)
  .put(validate(idParams, 'params'), validate(updateExamSchema), updateExam)
  .delete(validate(idParams, 'params'), deleteExam);

router.get('/:id/sessions', validate(idParams, 'params'), listExamSessions);

export default router;
