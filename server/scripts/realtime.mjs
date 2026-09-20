/**
 * Real-time proctoring test: candidate browser -> Socket.io -> MongoDB -> admin.
 * Requires the server to be running.  node scripts/realtime.mjs
 */
import { io } from 'socket.io-client';

const BASE = process.env.API_BASE ?? 'http://localhost:5000/api';
const SOCKET = process.env.SOCKET_BASE ?? 'http://localhost:5000';
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
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function waitFor(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET, { auth: { token }, transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

const run = async () => {
  const login = await call('POST', '/auth/login', {
    body: { email: 'admin@proctora.local', password: 'Admin@123' },
  });
  ok('admin login', login.status === 200, login.json);
  const adminToken = login.json.data.token;

  const created = await call('POST', '/exams', {
    token: adminToken,
    body: {
      title: 'Realtime Check Exam',
      description: 'scripts/realtime.mjs',
      duration: 10,
      questions: [
        { questionText: 'Live?', options: ['Yes', 'No', 'Maybe', 'Never'], correctAnswer: 0, marks: 10 },
        { questionText: 'Second?', options: ['A', 'B', 'C', 'D'], correctAnswer: 3, marks: 10 },
      ],
    },
  });
  ok('exam created', created.status === 201, created.json);
  const exam = created.json.data;

  /* Admin dashboard socket (private admin room). */
  const adminSocket = await connect(adminToken);
  ok('admin socket connected', adminSocket.connected);

  const subAck = await adminSocket.emitWithAck('admin:subscribe', { examId: exam.id });
  ok('admin subscribed to the exam room', subAck?.ok === true, subAck);

  const badSub = await adminSocket.emitWithAck('admin:subscribe', {
    examId: '0'.repeat(24),
  });
  ok('admin cannot subscribe to a foreign exam', badSub?.ok === false, badSub);

  /* Unauthenticated sockets must be refused. */
  await new Promise((resolve) => {
    const rogue = io(SOCKET, { auth: {}, transports: ['websocket'], reconnection: false });
    rogue.once('connect_error', (error) => {
      ok(`socket without a token is rejected (${error.message})`, true);
      rogue.close();
      resolve();
    });
    rogue.once('connect', () => {
      ok('socket without a token is rejected', false, 'it connected');
      resolve();
    });
  });

  /* Candidate starts the exam - admin should hear about it immediately. */
  const startedPromise = waitFor(adminSocket, 'session:started');
  const candidateEmail = `realtime.${Date.now()}@example.com`;
  const start = await call('POST', `/exams/${exam.id}/start`, {
    body: { candidateName: 'Realtime Candidate', candidateEmail },
  });
  ok('candidate started the exam', start.status === 201, start.json);
  const sessionToken = start.json.data.sessionToken;
  const session = start.json.data.session;
  const questions = start.json.data.exam.questions;

  const startedEvent = await startedPromise;
  ok(
    'admin received session:started without polling',
    startedEvent.session.id === session.id,
    startedEvent
  );

  /* Candidate socket (authorised by the exam-session token). */
  const onlinePromise = waitFor(adminSocket, 'candidate:online');
  const candidateSocket = await connect(sessionToken);
  ok('candidate socket connected with the session token', candidateSocket.connected);
  const online = await onlinePromise;
  ok('admin received candidate:online', online.sessionId === session.id, online);

  /* Violations over the socket, verified on the admin side. */
  for (const type of ['TAB_SWITCH', 'NO_FACE', 'MULTIPLE_FACES', 'FULLSCREEN_EXIT', 'NOISE_DETECTED']) {
    const received = waitFor(adminSocket, 'violation:new');
    const ack = await candidateSocket.emitWithAck('violation:report', {
      type,
      timestamp: new Date().toISOString(),
      metadata: { source: 'realtime-check' },
    });
    ok(`${type} acknowledged by the server (severity ${ack?.violation?.severity})`, ack?.ok === true, ack);

    const event = await received;
    ok(
      `admin received violation:new for ${type} in real time`,
      event.violation.type === type && event.candidate.sessionId === session.id,
      event
    );
  }

  const badAck = await candidateSocket.emitWithAck('violation:report', { type: 'NOPE' });
  ok('invalid violation payload rejected over the socket', badAck?.ok === false, badAck);

  /* Heartbeat telemetry reaches the admin session view. */
  const heartbeatPromise = waitFor(adminSocket, 'candidate:heartbeat');
  candidateSocket.emit('candidate:heartbeat', { faces: 1, volume: 0.03, fullscreen: true });
  const heartbeat = await heartbeatPromise;
  ok('admin received candidate:heartbeat telemetry', heartbeat.faces === 1, heartbeat);

  /* Violations were persisted, not just broadcast. */
  const stored = await call('GET', `/sessions/${session.id}/violations`, { token: adminToken });
  ok(
    `all 5 violations persisted to MongoDB (found ${stored.json.data?.length})`,
    stored.status === 200 && stored.json.data.length === 5,
    stored.json
  );
  ok(
    'severity mapping stored correctly',
    stored.json.data.find((v) => v.type === 'MULTIPLE_FACES').severity === 'HIGH' &&
      stored.json.data.find((v) => v.type === 'NOISE_DETECTED').severity === 'LOW' &&
      stored.json.data.find((v) => v.type === 'FULLSCREEN_EXIT').severity === 'MEDIUM'
  );

  /* Submission broadcast + scoring. */
  const submittedPromise = waitFor(adminSocket, 'session:submitted');
  const submit = await call('POST', `/sessions/${session.id}/submit`, {
    token: sessionToken,
    body: {
      answers: [
        { questionId: questions[0].id, selectedOption: 0 },
        { questionId: questions[1].id, selectedOption: 1 },
      ],
      reason: 'MANUAL',
    },
  });
  ok('candidate submitted', submit.status === 200, submit.json);
  ok(
    `score is 10/20 = 50% (${submit.json.data.score}/${submit.json.data.totalMarks})`,
    submit.json.data.score === 10 && submit.json.data.percentage === 50,
    submit.json.data
  );

  const submittedEvent = await submittedPromise;
  ok(
    'admin received session:submitted with the score',
    submittedEvent.session.id === session.id && submittedEvent.session.score === 10,
    submittedEvent
  );
  ok(
    'submitted event carries the violation count',
    submittedEvent.session.violationCount === 5,
    submittedEvent.session
  );

  /* A candidate socket must not be able to act as an admin. */
  const escalate = await candidateSocket
    .timeout(1500)
    .emitWithAck('admin:subscribe', { examId: exam.id })
    .then((response) => response)
    .catch(() => 'no-handler');
  ok(
    'candidate socket cannot use admin:subscribe (no handler registered)',
    escalate === 'no-handler',
    escalate
  );

  candidateSocket.close();
  adminSocket.close();

  await call('DELETE', `/exams/${exam.id}`, { token: adminToken });
  console.log(`\n${pass} assertions passed.`);
};

run().catch((error) => {
  console.error('realtime test crashed:', error);
  process.exit(1);
});
