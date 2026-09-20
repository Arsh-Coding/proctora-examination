import { z } from 'zod';
import { VIOLATION_TYPES, publicProctoringConfig } from '../config/proctoring';
import { recordViolation } from '../services/violation.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const createViolationSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid session id').optional(),
  type: z.enum(VIOLATION_TYPES),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/**
 * REST fallback for violation reporting. The candidate client prefers the
 * Socket.io channel; this endpoint is used when the socket is disconnected so no
 * violation is ever lost.
 */
export const createViolation = asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createViolationSchema>;
  const tokenSessionId = req.sessionToken!.sub;

  if (body.sessionId && body.sessionId !== tokenSessionId) {
    throw ApiError.forbidden('You cannot report violations for another session');
  }

  const { violation, violationCount } = await recordViolation({
    sessionId: tokenSessionId,
    type: body.type,
    timestamp: body.timestamp,
    metadata: body.metadata,
  });

  res.status(201).json({
    success: true,
    data: {
      id: violation._id.toString(),
      type: violation.type,
      severity: violation.severity,
      timestamp: violation.timestamp,
      violationCount,
    },
  });
});

/** Public: lets the browser read thresholds/severities from one shared place. */
export const getProctoringConfig = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: publicProctoringConfig });
});
