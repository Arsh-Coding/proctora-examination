/**
 * REST smoke test for the PROCTORA API. Run with the server already up:
 *   node scripts/smoke.mjs
 * Exits non-zero on the first failed assertion.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:5000/api';
let pass = 0;

function ok(label, condition, extra) {
  if (!condition) {
    console.error(`FAIL  ${label}`, extra ?? '');
    process.exit(1);
  }
  pass += 1;
  console.log(`ok    ${label}`);
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const run = async () => {
  const health = await call('GET', '/health');
  ok('health', health.status === 200 && health.json.data.status === 'ok');

  const login = await call('POST', '/auth/login', {
    body: { email: 'admin@proctora.local', password: 'Admin@123' },
  });
  ok('admin login', login.status === 200 && !!login.json.data.token, login.json);
  const adminToken = login.json.data.token;

  const badLogin = await call('POST', '/auth/login', {
    body: { email: 'admin@proctora.local', password: 'wrong-password' },
  });
  ok('bad password rejected', badLogin.status === 401);

  const noAuth = await call('GET', '/exams');
  ok('exams require auth', noAuth.status === 401);

  const created = await call('POST', '/exams', {
    token: adminToken,
    body: {
      title: 'Smoke Test Exam',
      description: 'Created by scripts/smoke.mjs',
      duration: 15,
      questions: [
        { questionText: '2 + 2 = ?', options: ['3', '4', '5', '6'], correctAnswer: 1, marks: 10 },
        { questionText: 'Sky colour?', options: ['Green', 'Blue', 'Red', 'Grey'], correctAnswer: 1, marks: 10 },
        { questionText: 'Node runs on?', options: ['V8', 'JVM', 'CLR', 'BEAM'], correctAnswer: 0, marks: 10 },
        { questionText: 'HTTP status for Not Found?', options: ['200', '301', '404', '500'], correctAnswer: 2, marks: 10 },
        { questionText: 'Letter answer form?', options: ['w', 'x', 'y', 'z'], correctAnswer: 'C', marks: 10 },
      ],
    },
  });
  ok('create exam', created.status === 201, created.json);
  const exam = created.json.data;
  ok('exam totals computed', exam.totalMarks === 50 && exam.questionCount === 5, exam);
  ok('letter answer normalised to index', exam.questions[4].correctAnswer === 2, exam.questions[4]);

  const invalid = await call('POST', '/exams', {
    token: adminToken,
    body: { title: 'x', duration: 0, questions: [] },
  });
  ok('validation rejects bad exam', invalid.status === 400, invalid.json);

  const pub = await call('GET', `/exams/${exam.id}/public`);
  ok('public exam view works without auth', pub.status === 200 && pub.json.data.title === 'Smoke Test Exam');
  ok('public exam view hides questions', pub.json.data.questions === undefined, pub.json.data);

  const candidateEmail = `smoke.${Date.now()}@example.com`;
  const start = await call('POST', `/exams/${exam.id}/start`, {
    body: { candidateName: 'Smoke Candidate', candidateEmail },
  });
  ok('candidate can start exam without an account', start.status === 201, start.json);
  const sessionToken = start.json.data.sessionToken;
  const session = start.json.data.session;
  const questions = start.json.data.exam.questions;
  ok('session token issued', typeof sessionToken === 'string' && sessionToken.length > 20);
  ok('candidate receives questions', questions.length === 5);
  ok(
    'candidate payload never contains correctAnswer',
    !JSON.stringify(start.json.data.exam).includes('correctAnswer'),
    Object.keys(questions[0])
  );
  ok('server issues a deadline', typeof session.remainingMs === 'number' && session.remainingMs > 14 * 60 * 1000);
  ok('proctoring config delivered', typeof start.json.data.proctoring.noFaceGraceMs === 'number');

  const resume = await call('POST', `/exams/${exam.id}/start`, {
    body: { candidateName: 'Smoke Candidate', candidateEmail },
  });
  ok('re-starting resumes the same session', resume.status === 200 && resume.json.data.resumed === true && resume.json.data.session.id === session.id);

  // Answer 4 of 5 correctly (30 of 50 marks) and leave one blank.
  const answers = [
    { questionId: questions[0].id, selectedOption: 1 }, // correct
    { questionId: questions[1].id, selectedOption: 1 }, // correct
    { questionId: questions[2].id, selectedOption: 0 }, // correct
    { questionId: questions[3].id, selectedOption: 0 }, // wrong
  ];
  const saved = await call('PATCH', `/sessions/${session.id}/answers`, {
    token: sessionToken,
    body: { answers },
  });
  ok('incremental answer save', saved.status === 200 && saved.json.data.answeredCount === 4, saved.json);

  const tampered = await call('PATCH', `/sessions/${session.id}/answers`, {
    token: sessionToken,
    body: { answers: [{ questionId: '0'.repeat(24), selectedOption: 1 }] },
  });
  ok('rejects answers for foreign question ids', tampered.status === 400, tampered.json);

  const restored = await call('GET', '/sessions/me', { token: sessionToken });
  ok('session restore returns saved answers', restored.status === 200 && restored.json.data.session.answers.length === 4, restored.json);

  const wrongToken = await call('PATCH', `/sessions/${session.id}/answers`, {
    token: adminToken,
    body: { answers },
  });
  ok('admin token cannot write candidate answers', wrongToken.status === 403, wrongToken.json);

  for (const type of ['TAB_SWITCH', 'NO_FACE', 'MULTIPLE_FACES', 'NOISE_DETECTED', 'FULLSCREEN_EXIT']) {
    const v = await call('POST', '/violations', {
      token: sessionToken,
      body: { sessionId: session.id, type, metadata: { source: 'smoke' } },
    });
    ok(`violation ${type} recorded (${v.json.data?.severity})`, v.status === 201, v.json);
  }

  const badViolation = await call('POST', '/violations', {
    token: sessionToken,
    body: { sessionId: session.id, type: 'NOT_A_REAL_TYPE' },
  });
  ok('unknown violation type rejected', badViolation.status === 400);

  const submit = await call('POST', `/sessions/${session.id}/submit`, {
    token: sessionToken,
    body: { reason: 'MANUAL' },
  });
  ok('submit succeeds', submit.status === 200, submit.json);
  ok(
    `score calculated correctly (${submit.json.data.score}/${submit.json.data.totalMarks} = ${submit.json.data.percentage}%)`,
    submit.json.data.score === 30 && submit.json.data.totalMarks === 50 && submit.json.data.percentage === 60,
    submit.json.data
  );
  ok('submission response hides the answer key', !JSON.stringify(submit.json).includes('correctAnswer'));

  const resubmit = await call('POST', `/sessions/${session.id}/submit`, {
    token: sessionToken,
    body: { reason: 'MANUAL' },
  });
  ok('resubmit is idempotent', resubmit.status === 200 && resubmit.json.data.alreadySubmitted === true);

  const lateSave = await call('PATCH', `/sessions/${session.id}/answers`, {
    token: sessionToken,
    body: { answers },
  });
  ok('answers locked after submission', lateSave.status === 400, lateSave.json);

  const adminSession = await call('GET', `/sessions/${session.id}`, { token: adminToken });
  ok('admin can read the session', adminSession.status === 200, adminSession.json);
  ok('admin sees the score', adminSession.json.data.session.score === 30 && adminSession.json.data.session.percentage === 60);
  ok('admin sees violation count', adminSession.json.data.session.violationCount === 5, adminSession.json.data.session);
  ok('admin sees violation list', adminSession.json.data.violations.length === 5);
  ok('admin review includes the answer key', adminSession.json.data.review[0].correctAnswer === 1);
  ok(
    'severity mapping applied',
    adminSession.json.data.violations.find((v) => v.type === 'MULTIPLE_FACES').severity === 'HIGH' &&
      adminSession.json.data.violations.find((v) => v.type === 'NOISE_DETECTED').severity === 'LOW' &&
      adminSession.json.data.violations.find((v) => v.type === 'TAB_SWITCH').severity === 'MEDIUM'
  );

  const violationsList = await call('GET', `/sessions/${session.id}/violations`, { token: adminToken });
  ok('violations endpoint', violationsList.status === 200 && violationsList.json.data.length === 5);

  const examSessions = await call('GET', `/exams/${exam.id}/sessions`, { token: adminToken });
  ok('exam session list', examSessions.status === 200 && examSessions.json.data.sessions.length === 1);

  const stats = await call('GET', '/stats/dashboard', { token: adminToken });
  ok('dashboard stats', stats.status === 200, stats.json);
  ok(
    `stats are live (exams=${stats.json.data.totals.exams} attempts=${stats.json.data.totals.attempts} violations=${stats.json.data.totals.violations} avg=${stats.json.data.totals.averageScore})`,
    stats.json.data.totals.exams >= 2 && stats.json.data.totals.violations >= 5 && stats.json.data.totals.completedAttempts >= 1
  );

  const secondAttempt = await call('POST', `/exams/${exam.id}/start`, {
    body: { candidateName: 'Smoke Candidate', candidateEmail },
  });
  ok('duplicate attempt blocked after submission', secondAttempt.status === 409, secondAttempt.json);

  const updated = await call('PUT', `/exams/${exam.id}`, {
    token: adminToken,
    body: { isActive: false },
  });
  ok('exam update', updated.status === 200 && updated.json.data.isActive === false);

  const closedStart = await call('POST', `/exams/${exam.id}/start`, {
    body: { candidateName: 'Another', candidateEmail: `other.${Date.now()}@example.com` },
  });
  ok('inactive exam refuses new attempts', closedStart.status === 403, closedStart.json);

  const removed = await call('DELETE', `/exams/${exam.id}`, { token: adminToken });
  ok('exam delete cascades', removed.status === 200);
  const goneSession = await call('GET', `/sessions/${session.id}`, { token: adminToken });
  ok('sessions removed with the exam', goneSession.status === 404);

  console.log(`\n${pass} assertions passed.`);
};

run().catch((error) => {
  console.error('smoke test crashed:', error);
  process.exit(1);
});
