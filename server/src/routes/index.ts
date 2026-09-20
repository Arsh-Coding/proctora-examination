import { Router } from 'express';
import { getProctoringConfig } from '../controllers/violation.controller';
import { getDashboardStats } from '../controllers/stats.controller';
import { authorize, requireAuth } from '../middleware/auth';
import authRoutes from './auth.routes';
import examRoutes from './exam.routes';
import sessionRoutes from './session.routes';
import violationRoutes from './violation.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
});

router.get('/proctoring/config', getProctoringConfig);

router.use('/auth', authRoutes);
router.use('/exams', examRoutes);
router.use('/sessions', sessionRoutes);
router.use('/violations', violationRoutes);

router.get('/stats/dashboard', requireAuth, authorize('ADMIN'), getDashboardStats);

export default router;
