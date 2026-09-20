import { Exam } from '../models/Exam';
import { ExamSession } from '../models/ExamSession';
import { Violation } from '../models/Violation';
import { serializeSessionForAdmin } from '../services/session.service';
import { serializeViolation } from '../services/violation.service';
import { asyncHandler } from '../utils/asyncHandler';

/** Every number here is derived from live collections - nothing is hardcoded. */
export const getDashboardStats = asyncHandler(async (req, res) => {
  const adminId = req.admin!._id;

  const exams = await Exam.find({ createdBy: adminId }).select('_id title isActive');
  const examIds = exams.map((e) => e._id);
  const examTitles = new Map(exams.map((e) => [e._id.toString(), e.title]));

  const [sessions, violationTotal, violationsByTypeRows, recentViolationDocs] = await Promise.all([
    ExamSession.find({ examId: { $in: examIds } }).sort({ createdAt: -1 }),
    Violation.countDocuments({ examId: { $in: examIds } }),
    Violation.aggregate<{ _id: string; count: number }>([
      { $match: { examId: { $in: examIds } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Violation.find({ examId: { $in: examIds } }).sort({ timestamp: -1 }).limit(15),
  ]);

  const submitted = sessions.filter((s) => s.status === 'SUBMITTED');
  const inProgress = sessions.filter((s) => s.status === 'IN_PROGRESS');
  const uniqueCandidates = new Set(sessions.map((s) => s.candidateEmail)).size;

  const percentages = submitted
    .filter((s) => s.totalMarks > 0)
    .map((s) => (s.score / s.totalMarks) * 100);
  const averageScore =
    percentages.length > 0
      ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 100) / 100
      : 0;

  const violationCounts = await Violation.aggregate<{ _id: unknown; count: number }>([
    { $match: { sessionId: { $in: sessions.slice(0, 10).map((s) => s._id) } } },
    { $group: { _id: '$sessionId', count: { $sum: 1 } } },
  ]);
  const countsBySession = new Map(violationCounts.map((row) => [String(row._id), row.count]));

  res.json({
    success: true,
    data: {
      totals: {
        exams: exams.length,
        activeExams: exams.filter((e) => e.isActive).length,
        candidates: uniqueCandidates,
        attempts: sessions.length,
        completedAttempts: submitted.length,
        inProgressAttempts: inProgress.length,
        averageScore,
        violations: violationTotal,
      },
      violationsByType: violationsByTypeRows.map((row) => ({ type: row._id, count: row.count })),
      recentSessions: sessions.slice(0, 10).map((session) =>
        serializeSessionForAdmin(session, {
          violationCount: countsBySession.get(session._id.toString()) ?? 0,
          examTitle: examTitles.get(session.examId.toString()),
        })
      ),
      recentViolations: recentViolationDocs.map((violation) => ({
        ...serializeViolation(violation),
        examTitle: examTitles.get(violation.examId.toString()),
      })),
    },
  });
});
