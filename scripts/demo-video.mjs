/**
 * Records an end-to-end video demo of PROCTORA.
 *
 * The whole product is driven through its real UI in Chromium while Playwright
 * records the page: admin sign-in, exam authoring, the candidate link, the
 * system check with live on-device face detection, a proctored attempt,
 * violations, submission, server-side marking, live monitoring and the final
 * report. Narration is drawn as an overlay on top of the running app.
 *
 * Nothing about the application is stubbed. The only things substituted are the
 * camera and microphone devices, which are synthetic Y4M/beep sources fed to
 * Chromium so the run is unattended and repeatable — the app still runs the real
 * MediaPipe detector over those frames.
 *
 * Prerequisites
 *   1. MongoDB running
 *   2. `npm run seed`   (creates the demo admin)
 *   3. `npm run dev`    (API on :5000, Vite on :5173)
 *   4. `npx playwright install chromium`
 *
 * Usage
 *   node scripts/demo-video.mjs
 *
 * Environment
 *   WEB_BASE      web origin              (default http://localhost:5173)
 *   API_BASE      api origin              (default http://localhost:5000)
 *   DEMO_OUT      output directory        (default <repo>/demo)
 *   DEMO_SPEED    pacing divisor, 1.5 = 1.5x faster   (default 1)
 *   DEMO_HEADFUL  set to "true" to watch the browser while it records
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildCameraClips } from './demo/camera.mjs';
import { openCandidate } from './demo/extra-candidate.mjs';
import { installOverlay } from './demo/overlay.mjs';
import { mixNarration } from './demo/mixdown.mjs';
import { budget, demoSpeed, Stage, sleep } from './demo/stage.mjs';
import { Narrator } from './demo/voice.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/**
 * Flags take precedence over environment variables, so a cut can be produced
 * with a single command:
 *   node scripts/demo-video.mjs --voice male --scale 1.0 --name proctora-demo-male
 */
function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}

const WEB = flag('web', process.env.WEB_BASE ?? 'http://localhost:5173');
const API = flag('api', process.env.API_BASE ?? 'http://localhost:5000');
const OUT = flag('out', process.env.DEMO_OUT ?? path.join(REPO, 'demo'));
const HEADFUL = process.env.DEMO_HEADFUL === 'true' || process.argv.includes('--headful');
/** "male", "female", or an installed voice name such as "Microsoft Mark". */
const VOICE = flag('voice', process.env.DEMO_VOICE ?? 'female');
/** SSML prosody multiplier. 1.0 is the voice's natural speed. */
const VOICE_SCALE = Number(flag('scale', process.env.DEMO_VOICE_SCALE ?? 0.94));
/** Base filename for this cut, so different voices do not overwrite each other. */
const OUT_NAME = flag('name', process.env.DEMO_OUT_NAME ?? 'proctora-demo');

const VIEW = { width: 1280, height: 720 };

const ADMIN = { email: 'admin@proctora.local', password: 'Admin@123' };

const CANDIDATE = {
  name: 'Aarav Sharma',
  email: `aarav.sharma.${Date.now()}@example.com`,
};

/** The exam the video builds on camera. Authored to score exactly 30/50. */
const EXAM = {
  title: 'JavaScript Essentials — Screening Round',
  description: 'Five multiple-choice questions. Ten marks each. Proctored end to end.',
  duration: '20',
  questions: [
    {
      text: 'What does `typeof null` evaluate to in JavaScript?',
      options: ['object', 'null', 'undefined', 'boolean'],
      correct: 'A',
    },
    {
      text: 'What does Array.prototype.map return?',
      options: [
        'The original array, mutated in place',
        'A new array of the same length',
        'A single accumulated value',
        'undefined',
      ],
      correct: 'B',
    },
    {
      text: 'Which keyword declares a block-scoped binding that cannot be reassigned?',
      options: ['var', 'let', 'const', 'static'],
      correct: 'C',
    },
    {
      text: 'Promise.all rejects as soon as…',
      options: [
        'every input promise has rejected',
        'any one input promise rejects',
        'never — it always resolves',
        'the first promise resolves',
      ],
      correct: 'B',
    },
    {
      text: 'What is the value of `0.1 + 0.2 === 0.3`?',
      options: ['true', 'NaN', 'a TypeError is thrown', 'false'],
      correct: 'D',
    },
  ],
};

/** Q1–Q4 answered, Q5 left blank: three right, one wrong → 30/50 (60%). */
const CANDIDATE_PICKS = ['A', 'B', 'C', 'A'];

const log = (...args) => console.log('·', ...args);

/** Silence held after every spoken line. */
const PAUSE_MS = Number(process.env.DEMO_VOICE_PAUSE ?? 550);

/**
 * Prints where the narration goes quiet. Long silences are what makes a
 * walkthrough feel like it is stalling, so they are worth seeing as numbers
 * rather than discovering on playback.
 */
function reportPacing(cues, totalMs, spokenMs) {
  const ordered = [...cues].sort((a, b) => a.at - b.at);
  const gaps = [];
  let cursor = 0;
  let after = '(start of film)';
  for (const cue of ordered) {
    if (cue.at - cursor > 0) gaps.push({ at: cursor, seconds: (cue.at - cursor) / 1000, after });
    cursor = Math.max(cursor, cue.at + cue.durationMs);
    after = cue.text ?? after;
  }
  if (totalMs - cursor > 0) gaps.push({ at: cursor, seconds: (totalMs - cursor) / 1000, after });

  const clock = (ms) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  const long = gaps.filter((gap) => gap.seconds >= 6).sort((a, b) => b.seconds - a.seconds);

  console.log(
    `\n Narration covers ${Math.round((spokenMs / totalMs) * 100)}% of ` +
      `${clock(totalMs)} (${ordered.length} lines).`
  );
  if (long.length > 0) {
    console.log(' Silent stretches over 6s:');
    for (const gap of long.slice(0, 8)) {
      console.log(
        `   ${clock(gap.at).padStart(6)}  ${gap.seconds.toFixed(1).padStart(5)}s  ` +
          `after: “${String(gap.after).slice(0, 62)}”`
      );
    }
  }
}

/**
 * Holds off idle sleep for the length of the recording.
 *
 * A run takes ten minutes or so with no keyboard or mouse activity, which is
 * exactly what Windows treats as idle. If the machine suspends mid-take the
 * video is ruined and the wall clock jumps, so a helper process keeps the
 * request flag raised. `SetThreadExecutionState` is per-process and the flag
 * lapses the moment that process exits, so nothing is left changed afterwards.
 *
 * @returns {() => void} release
 */
function keepAwake() {
  const script = [
    '$sig = @"',
    '[DllImport("kernel32.dll", SetLastError=true)]',
    'public static extern uint SetThreadExecutionState(uint esFlags);',
    '"@',
    'Add-Type -MemberDefinition $sig -Name Power -Namespace Win32 | Out-Null',
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
    '[Win32.Power]::SetThreadExecutionState(0x80000000 -bor 0x00000001 -bor 0x00000002) | Out-Null',
    'while ($true) { Start-Sleep -Seconds 30 }',
  ].join('\n');

  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
    });
    child.unref();
    return () => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    };
  } catch {
    return () => {};
  }
}

function run(exe, args) {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`${path.basename(exe)} failed (exit ${result.status})\n${result.stderr ?? ''}`);
  }
  return result.stdout ?? '';
}

/**
 * Locates a full ffmpeg build. The copy Playwright ships is video-only (no audio
 * encoders at all), so it cannot be used to attach the narration.
 */
function findFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;

  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', windowsHide: true });
  if (probe.status === 0) return 'ffmpeg';

  // winget installs land here and are only added to PATH for new shells.
  const roots = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    let guard = 0;
    while (stack.length > 0 && guard < 4000) {
      guard += 1;
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.name.toLowerCase() === 'ffmpeg.exe') return full;
      }
    }
  }
  return null;
}

/** Per-scene wall clock, so the running time can be budgeted deliberately. */
const timings = [];
async function scene(name, fn) {
  const started = Date.now();
  const result = await fn();
  const seconds = (Date.now() - started) / 1000;
  timings.push({ name, seconds });
  log(`[${seconds.toFixed(1)}s] ${name}`);
  return result;
}

/* -------------------------------------------------------------------------- */
/* Preflight                                                                  */
/* -------------------------------------------------------------------------- */

async function preflight() {
  const fail = (message) => {
    console.error(`\n✕ ${message}\n`);
    process.exit(1);
  };

  try {
    const health = await fetch(`${API}/api/health`);
    if (!health.ok) throw new Error(`status ${health.status}`);
  } catch (error) {
    fail(`Cannot reach the API at ${API} (${error.message}).\n  Start it with:  npm run dev`);
  }

  try {
    const web = await fetch(WEB);
    if (!web.ok) throw new Error(`status ${web.status}`);
  } catch (error) {
    fail(`Cannot reach the client at ${WEB} (${error.message}).\n  Start it with:  npm run dev`);
  }

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  if (!login.ok) {
    fail(
      `The demo admin (${ADMIN.email}) cannot sign in.\n  Create it with:  npm run seed`
    );
  }
  log('API, client and demo admin all reachable');
}

/* -------------------------------------------------------------------------- */
/* Scenes                                                                     */
/* -------------------------------------------------------------------------- */

async function sceneIntro(stage) {
  await stage.cover(
    {
      brand: true,
      badge: 'AS',
      brandName: 'ARSHPREET SINGH',
      kicker: 'Project walkthrough',
      title: 'Hi, I’m Arshpreet.',
      subtitle:
        'Full-stack developer — Node.js, React and TypeScript. Associate Software Engineer.',
      items: [
        'I built PROCTORA: an online exam platform with remote proctoring built into the browser',
        'React + TypeScript on the front end, Express + TypeScript and MongoDB behind it',
        'Real-time delivery over Socket.io, and every detector runs on-device',
      ],
      footer: 'arshpreet.singh.dev@gmail.com',
      voice:
        "Hi, I'm Arshpreet Singh, a full-stack developer working with Node.js, React and TypeScript. " +
        'I built PROCTORA, an online exam platform with remote proctoring built into the browser. ' +
        'Let me show you how it works.',
    },
    1200
  );
}

async function sceneTitle(stage) {
  await stage.cover(
    {
      brand: true,
      title: 'Online exams with browser-based remote proctoring',
      items: [
        'An admin authors an exam and shares one link',
        'The candidate sits it under camera, microphone and browser monitoring',
        'Every violation reaches the admin live, over Socket.io',
        'Marking, timing and storage are all server-side',
      ],
      footer: 'React + TypeScript · Express + TypeScript · MongoDB · Socket.io · MediaPipe',
      voice:
        'An admin authors an exam and shares one link. The candidate sits it under camera, ' +
        'microphone and browser monitoring. Every violation reaches the admin live. ' +
        'Marking, timing and storage are all server-side.',
    },
    1200
  );
}

async function sceneAdminLogin(stage) {
  const { page } = stage;
  await stage.chapter('1 / 9 — Admin console');
  await stage.goto(`${WEB}/login`);

  await stage.say(
    'An administrator signs in to the console.',
    'Admins authenticate with email and password and get a JWT. Candidates never create an account.',
    { hold: 3800 }
  );

  await stage.spot(page.getByText('Demo credentials (development only)').locator('..'), { hold: 1500 });
  await stage.click(page.getByRole('button', { name: /fill demo credentials/i }));
  await stage.unspot();
  await stage.say('Seeded development credentials.', 'Created by `npm run seed`.', { hold: 2000 });

  await stage.click(page.getByRole('button', { name: /^sign in$/i }));
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await stage.settleRoute({ settle: 1600 });
  log('signed in as admin');
}

async function sceneDashboard(stage) {
  const { page } = stage;
  await page.getByText('Total exams').first().waitFor({ timeout: 20000 });
  await stage.hush();
  await stage.beat(700);

  await stage.say(
    'Every number here is read from MongoDB.',
    'No mock data anywhere in this build.',
    { hold: 2600 }
  );

  await stage.spot(page.getByText(/^Live$/).first(), { pad: 8 });
  await stage.say(
    'That “Live” badge is an open Socket.io connection.',
    'The dashboard is pushed to, not polled.',
    { tone: 'good', hold: 3400 }
  );
  await stage.unspot();

  for (const label of ['Total exams', 'Candidates', 'Average score', 'Violations']) {
    await stage.spot(page.getByText(label, { exact: true }).first().locator('../..'), { pad: 4 });
    await stage.beat(950);
  }
  await stage.unspot();

  await stage.reveal(page.getByText('Recent attempts').first());
  await stage.say('Recent attempts across every exam this admin owns.', null, { hold: 2400 });

  await stage.reveal(page.getByText('Live violation feed').first());
  await stage.spot(page.getByText('Streams in over Socket.io.').first().locator('../..'), { pad: 4 });
  await stage.say(
    'This feed is where proctoring events land the moment they happen.',
    'It is empty now. It will not be by the end of this video.',
    { hold: 3600 }
  );
  await stage.unspot();
  await stage.scrollTop();
}

async function sceneExamsList(stage) {
  const { page } = stage;
  await stage.chapter('2 / 9 — Authoring an exam');
  await stage.click(page.getByRole('link', { name: 'Exams', exact: true }).first());
  await page.getByText('Create an exam, then share its link with candidates.').waitFor({ timeout: 20000 });
  await stage.beat(900);

  await stage.say(
    'Exams list: duration, question count, marks, attempts and status.',
    'Each row can copy its candidate link, open or close the exam, or be deleted with its attempts.',
    { hold: 4200 }
  );
  await stage.spot(page.locator('thead').first(), { hold: 1600, pad: 4 });

  await stage.click(page.getByRole('link', { name: /create exam/i }).first());
  await page.getByText('Exam details').first().waitFor({ timeout: 20000 });
  await stage.beat(800);
}

async function sceneCreateExam(stage) {
  const { page } = stage;

  await stage.say('Exam details first.', null, { hold: 1500 });
  await stage.type(page.getByLabel('Exam title'), EXAM.title, { delay: 38 });
  await stage.type(page.getByLabel('Description'), EXAM.description, { delay: 16 });
  await stage.type(page.getByLabel('Duration (minutes)'), EXAM.duration, { clear: true, delay: 140 });
  await stage.say(
    'The duration is enforced by the server, not the browser.',
    null,
    { hold: 2400 }
  );

  const blocks = page.locator('fieldset');

  /* Question 1 is typed at full speed so the builder is visible in use. */
  await stage.say('Question one, typed out in full.', null, { hold: 1500 });
  const first = blocks.nth(0);
  await stage.type(first.locator('textarea'), EXAM.questions[0].text, { delay: 24 });
  for (const [index, letter] of ['A', 'B', 'C', 'D'].entries()) {
    // A line here covers the keystrokes, which would otherwise be dead air.
    if (index === 1) {
      await stage.say(
        'Four options per question, one of them correct.',
        'Everything is validated again on the server, so a crafted request cannot save a broken exam.',
        { hold: 0 }
      );
    }
    await stage.type(first.getByLabel(`Option ${letter}`), EXAM.questions[0].options[index], {
      delay: 20,
      settle: 120,
    });
  }
  await stage.say('Then mark which option is correct.', null, { hold: 1400 });
  await stage.click(first.getByRole('radio', { name: EXAM.questions[0].correct }));
  await stage.type(first.getByLabel('Marks'), '10', { clear: true, delay: 140 });

  /* The remaining four are identical work; fill them without the keystrokes. */
  await stage.say(
    'The other four are the same form.',
    'Filling them in directly to keep this short.',
    { hold: 2800 }
  );
  for (let i = 1; i < EXAM.questions.length; i += 1) {
    await stage.click(page.getByRole('button', { name: /add question/i }), { settle: 260 });
  }
  for (let i = 1; i < EXAM.questions.length; i += 1) {
    const q = EXAM.questions[i];
    const block = blocks.nth(i);
    await block.locator('textarea').fill(q.text);
    for (const [index, letter] of ['A', 'B', 'C', 'D'].entries()) {
      await block.getByLabel(`Option ${letter}`).fill(q.options[index]);
    }
    await block.getByRole('radio', { name: q.correct }).click();
    await block.getByLabel('Marks').fill('10');
    await sleep(240);
  }

  await stage.reveal(page.getByText('Total marks').first(), { block: 'start' });
  await stage.scrollTop({ settle: 900 });
  await stage.spot(page.getByText('Summary').first().locator('../..'), { pad: 4 });
  await stage.say(
    'Five questions, fifty marks.',
    'Total marks are the sum of the per-question marks — the admin never types a total.',
    { hold: 3600 }
  );
  await stage.unspot();

  await stage.click(page.getByRole('button', { name: /^create exam$/i }).first());
  await page.waitForURL(/\/exams\/[a-f\d]{24}$/, { timeout: 30000 });
  const examId = page.url().split('/exams/')[1];
  log(`exam created: ${examId}`);
  await stage.settleRoute({ settle: 1500 });
  return examId;
}

async function sceneExamLink(stage, examId) {
  const { page } = stage;
  await stage.chapter('3 / 9 — The candidate link');
  await page.getByText('Candidate exam link').waitFor({ timeout: 20000 });
  await stage.beat(700);

  await stage.say(
    'Saved, and validated server-side.',
    'The candidate link exists the moment the exam does.',
    { tone: 'good', hold: 3000 }
  );

  await stage.spot(page.getByText('Candidate exam link').locator('../..'), { pad: 4 });
  await stage.beat(1400);
  await stage.click(page.getByRole('button', { name: /copy exam link/i }).first());
  const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  log(`clipboard: ${clipboard}`);
  await stage.say(
    'One URL. No account, no install, no browser extension.',
    clipboard || `${WEB}/exam/${examId}`,
    { hold: 3600 }
  );
  await stage.unspot();

  await stage.reveal(page.getByText('Total marks').first());
  await stage.say('Questions, marks, duration, attempts and violations for this exam.', null, {
    hold: 2400,
  });

  await stage.reveal(page.getByRole('button', { name: /show answers/i }));
  await stage.click(page.getByRole('button', { name: /show answers/i }));
  await stage.say(
    'The answer key is visible here, to the owner.',
    'It is never included in any candidate response — the API strips it.',
    { tone: 'warn', hold: 4000 }
  );
  await stage.click(page.getByRole('button', { name: /hide answers/i }));
  await stage.hush();
}

async function sceneCandidateDetails(stage, examUrl) {
  const { page } = stage;
  await stage.chapter('4 / 9 — The candidate');
  await stage.cover(
    {
      kicker: 'Chapter 4',
      title: 'The candidate side',
      subtitle:
        'Opening the public exam link. Same browser, no sign-in, nothing installed.',
    },
    3600
  );
  await stage.goto(examUrl);

  await page.getByText('Step 1 — Candidate information').waitFor({ timeout: 20000 });
  await stage.say(
    'Step one asks for a name and an email, and nothing else.',
    'One attempt per email address per exam.',
    { hold: 3400 }
  );

  await stage.type(page.getByLabel('Full name'), CANDIDATE.name, { delay: 60 });
  await stage.type(page.getByLabel('Email'), CANDIDATE.email, { delay: 26 });
  await stage.click(page.getByRole('button', { name: /continue to system check/i }));
  await page.getByText('Step 2 — System check').waitFor({ timeout: 20000 });
  await stage.beat(800);
}

async function sceneSystemCheck(stage) {
  const { page } = stage;
  const startButton = page.getByRole('button', { name: /^start exam$/i });

  await stage.say(
    'Nothing starts until the environment passes.',
    'Every required check must be green before the exam can open.',
    { hold: 3400 }
  );
  await stage.spot(startButton, { pad: 8 });
  const disabled = await startButton.isDisabled();
  log(`start button disabled before checks: ${disabled}`);
  await stage.say('“Start exam” is disabled right now.', null, { tone: 'warn', hold: 2400 });
  await stage.unspot();

  await stage.click(page.getByRole('button', { name: /allow camera & microphone/i }));
  await page.getByText('Video stream is live.').waitFor({ timeout: 40000 });
  await page.getByText('Audio stream is live.').waitFor({ timeout: 25000 });
  await stage.say('Camera and microphone are live.', null, { tone: 'good', hold: 2000 });

  const faceRow = page.locator('li', { hasText: 'Face detection' }).first();
  let faceText = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    faceText = (await faceRow.innerText()).replace(/\s+/g, ' ');
    if (/frames analysed|no face is visible|unavailable/i.test(faceText)) break;
    await sleep(1000);
  }
  log(`face detection: ${faceText}`);

  await stage.spot(page.locator('[aria-label="Your camera preview"]').first().locator('..'), { pad: 8 });
  await stage.say(
    'That green box is live face-detection output.',
    'MediaPipe BlazeFace, running on-device. No video or audio ever leaves the browser.',
    { tone: 'good', hold: 4600 }
  );
  await stage.unspot();

  await stage.spot(faceRow, { pad: 4 });
  await stage.say(faceText.includes('frames analysed') ? 'The detector reports the frames it has analysed.' : 'Face detection status.', null, {
    hold: 2400,
  });
  await stage.unspot();

  await stage.reveal(page.getByText('What is monitored').first());
  await stage.spot(page.getByText('What is monitored').first().locator('../..'), { pad: 4 });
  await stage.say(
    'The candidate is told exactly what is watched.',
    'Face presence, face count, microphone loudness only, tab focus, fullscreen, and device loss.',
    { hold: 4600 }
  );
  await stage.unspot();
  await stage.scrollTop();

  await page.waitForFunction(
    () => {
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim().toLowerCase() === 'start exam'
      );
      return Boolean(button) && !button.disabled;
    },
    { timeout: 30000 }
  );
  await stage.spot(startButton, { pad: 8 });
  await stage.say('All required checks pass, so the exam unlocks.', null, { tone: 'good', hold: 2400 });
  await stage.unspot();
}

async function sceneExam(stage) {
  const { page } = stage;
  await stage.chapter('5 / 9 — Sitting the exam');
  await stage.click(page.getByRole('button', { name: /^start exam$/i }));
  await page.getByText(/Time Left:/).waitFor({ timeout: 30000 });
  await stage.beat(1200);

  const fullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
  log(`entered fullscreen: ${fullscreen}`);

  await stage.spot(page.locator('[role="timer"]').first(), { pad: 6 });
  await stage.say(
    'The countdown is anchored on the server.',
    'The browser only ever receives remainingMs, so moving the machine clock buys no extra time.',
    { hold: 4400 }
  );
  await stage.unspot();

  await stage.spot(page.getByText('Fullscreen', { exact: true }).first().locator('../..'), { pad: 6 });
  await stage.say(
    'Live proctoring signals, always on screen.',
    'Camera, microphone, face count, audio level, fullscreen, window focus and the socket link.',
    { hold: 4400 }
  );
  await stage.unspot();

  await stage.say('Answering the first four questions.', null, { hold: 1600 });
  for (let i = 0; i < CANDIDATE_PICKS.length; i += 1) {
    await page.getByRole('heading', { name: new RegExp(`Question ${i + 1} of 5`) }).waitFor();
    await stage.click(
      page.locator('label', { hasText: new RegExp(`^${CANDIDATE_PICKS[i]}\\.`) }).first(),
      { settle: 420, duration: 480 }
    );
    if (i === 0) {
      await page.getByText(/^Saved$/).waitFor({ timeout: 15000 }).catch(() => {});
      await stage.spot(page.getByText(/^(Saved|Answers autosave|Saving…)$/).first(), { pad: 6 });
      await stage.say('Answers autosave to the server as they are chosen.', null, {
        tone: 'good',
        hold: 2800,
      });
      await stage.unspot();
    }
    if (i === 2) {
      // Covers the rest of the answering loop, which is otherwise silent.
      await stage.say(
        'Each save is checked against this attempt.',
        'A question id from another exam, or an option out of range, is rejected — and a save after time is up returns 409.',
        { hold: 0 }
      );
    }
    await stage.click(page.getByRole('button', { name: /^next$/i }), { settle: 420, duration: 460 });
  }

  await page.getByText('4 of 5 answered').first().waitFor({ timeout: 15000 });
  await stage.reveal(page.getByText('Questions', { exact: true }).last());
  await stage.spot(page.getByText('4/5 answered').first().locator('../..'), { pad: 6 });
  await stage.say(
    'Four of five answered. Question five is deliberately left blank.',
    'The navigator shows answered, unanswered and current at a glance.',
    { hold: 4000 }
  );
  await stage.unspot();
  return fullscreen;
}

async function sceneViolations(stage, wasFullscreen) {
  const { page } = stage;
  await stage.chapter('6 / 9 — Proctoring in action');
  await stage.scrollTop({ settle: 600 });

  // Innermost element whose whole text starts with the panel title: that is the
  // card itself rather than one of its layout ancestors.
  // Outermost element whose *whole* text starts with the panel title, i.e. the
  // card itself: layout ancestors begin with earlier content, and inner nodes
  // hold only the heading.
  const events = page
    .locator('div')
    .filter({ hasText: /^Recorded events \(\d+\)/ })
    .first();
  const readEvents = async () => (await events.innerText().catch(() => '')).replace(/\s+/g, ' ');
  const waitForEvent = async (type, attempts = 24, delay = 700) => {
    for (let i = 0; i < attempts; i += 1) {
      if ((await readEvents()).includes(type)) return true;
      await sleep(delay);
    }
    return false;
  };

  /* ------------------------------ TAB_SWITCH ----------------------------- */
  await stage.say(
    'Leaving the exam window is recorded.',
    'The app listens for the document going hidden and for the window losing focus.',
    { tone: 'warn', hold: 3800 }
  );
  // Chromium under automation keeps a background tab reported as "visible", so a
  // native tab switch cannot be driven here. We fire the real `blur` event the
  // app already listens for; from the app's side this is an ordinary focus loss.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await stage.say(
    'The report goes out over the socket first.',
    'If the socket is down it falls back to a REST call, so an event is never lost.',
    { hold: 0 }
  );
  const gotTab = await waitForEvent('TAB_SWITCH');
  log(`TAB_SWITCH recorded: ${gotTab}`);

  const banner = page.getByText(/You left the exam window/i).first();
  if (await banner.count()) {
    await stage.spot(banner.locator('../..'), { pad: 6 });
    await stage.say(
      'The candidate is warned, and it counts against a budget.',
      'Warning 1 of 3. The MVP records rather than auto-terminates.',
      { tone: 'warn', hold: 4000 }
    );
    await stage.unspot();
  }

  /* --------------------------- FULLSCREEN_EXIT --------------------------- */
  if (wasFullscreen) {
    await stage.say('So is leaving fullscreen.', null, { tone: 'warn', hold: 1800 });
    await page.evaluate(() => document.exitFullscreen?.());
    const gotFs = await waitForEvent('FULLSCREEN_EXIT');
    log(`FULLSCREEN_EXIT recorded: ${gotFs}`);
    const fsBanner = page.getByText(/return to fullscreen mode/i).first();
    if (await fsBanner.count()) {
      await stage.spot(fsBanner.locator('..'), { pad: 6 });
      await stage.say(
        'Fullscreen is recorded, not enforced.',
        'A browser cannot trap a candidate in fullscreen, so the exit is logged instead.',
        { tone: 'warn', hold: 4200 }
      );
      await stage.unspot();
    }
  } else {
    log('fullscreen never engaged; skipping the FULLSCREEN_EXIT beat');
  }

  /* ------------------------- the candidate's log ------------------------- */
  await stage.reveal(page.getByText(/Recorded events/).first());
  await stage.spot(events, { pad: 6 });
  const recorded = await readEvents();
  log(`candidate event log: ${recorded.slice(0, 200)}`);
  await stage.say(
    'The candidate can see their own log.',
    '“saved” is the server acknowledging the write — these rows are already in MongoDB.',
    { tone: 'warn', hold: 4600 }
  );
  await stage.unspot();
  await stage.say(
    'Each type has a cooldown and a grace period.',
    'One long event produces one record, not hundreds.',
    { hold: 3400 }
  );
}

async function sceneSubmit(stage) {
  const { page } = stage;
  await stage.chapter('7 / 9 — Submission');
  await stage.reveal(page.getByRole('button', { name: /submit exam/i }).last());
  await stage.click(page.getByRole('button', { name: /submit exam/i }).last());
  await page.getByRole('heading', { name: /are you sure you want to submit/i }).waitFor({ timeout: 15000 });
  await stage.beat(600);

  await stage.say(
    'The dialog states exactly how many answers are blank.',
    null,
    { hold: 2800 }
  );
  await stage.click(page.getByRole('button', { name: /^cancel$/i }));
  await stage.say('Cancelling leaves the attempt running.', null, { hold: 2000 });

  await stage.click(page.getByRole('button', { name: /submit exam/i }).last());
  await page.getByRole('heading', { name: /are you sure you want to submit/i }).waitFor({ timeout: 15000 });
  await stage.click(page.getByRole('button', { name: /^submit$/i }));
  await page.getByRole('heading', { name: /exam submitted successfully/i }).waitFor({ timeout: 30000 });
  await stage.beat(1200);

  await stage.say(
    'No score and no answer key on this screen.',
    'Marking happens on the server; the administrator releases results.',
    { tone: 'good', hold: 4400 }
  );
  log('candidate submitted');
}

async function sceneLiveMonitoring(stage, examId, extras, warmup) {
  const { page } = stage;
  await stage.chapter('8 / 9 — Live monitoring');
  await stage.cover(
    {
      kicker: 'Chapter 8',
      title: 'Two more candidates, watched live',
      subtitle:
        'Back on the admin monitoring page. Two other people are about to start the same exam in their own browsers. This page is never refreshed from here on.',
    },
    2600
  );

  // Two more Chromium instances loading the face model is heavy, so it happens
  // behind this card: a static frame hides the contention, and the wait is only
  // as long as the machine needs.
  const [empty, crowd] = await warmup;
  extras.empty = empty;
  extras.crowd = crowd;
  log('off-camera candidates are at the system-check gate');

  await stage.goto(`${WEB}/exams/${examId}/sessions`);
  await page.getByText('Candidates').first().waitFor({ timeout: 20000 });
  await page.getByText(/^Live$/).first().waitFor({ timeout: 20000 });

  const rows = () => page.locator('tbody tr').count();
  const baseline = await rows();
  log(`monitoring page baseline rows: ${baseline}`);

  await stage.spot(page.getByText(/^Live$/).first(), { pad: 8 });
  await stage.say(
    'Connected. Watch this page change on its own.',
    'No refresh, no polling — server-pushed events.',
    { tone: 'good', hold: 3400 }
  );
  await stage.unspot();

  /* -------------------------- candidate: no face ------------------------- */
  await stage.say('A second candidate starts the exam now.', null, { hold: 1800 });
  await extras.empty.start();
  for (let i = 0; i < 20 && (await rows()) <= baseline; i += 1) await sleep(500);
  await stage.spot(page.locator('tbody tr').first(), { pad: 4 });
  await stage.say(
    'The attempt appeared by itself.',
    'session:started arrived over the socket and the table grew.',
    { tone: 'good', hold: 3800 }
  );
  await stage.unspot();

  await extras.empty.answerSome(2);
  await stage.say(
    'Their camera is pointed at an empty chair.',
    'The detector needs six continuous seconds of no face before it raises anything.',
    { tone: 'warn', hold: 3600 }
  );
  await stage.say(
    'Admins only ever see their own exams.',
    'Subscribing to a room is an ownership check on the server, not a client-side filter.',
    { hold: 0 }
  );
  const gotNoFace = await extras.empty.waitForViolation('NO_FACE');
  log(`off-camera candidate raised NO_FACE: ${gotNoFace}`);

  await stage.reveal(page.getByText('Live violations').first());
  await stage.spot(page.getByText('Live violations').first().locator('../..'), { pad: 4 });
  await stage.say(
    'NO_FACE, delivered live.',
    'The browser reports the event; the server assigns the severity and stores it.',
    { tone: 'warn', hold: 4400 }
  );
  await stage.unspot();

  /* ------------------------ candidate: two faces ------------------------- */
  await stage.say('A third candidate starts — with someone sitting next to them.', null, {
    hold: 2600,
  });
  await extras.crowd.start();
  await extras.crowd.answerSome(1);
  await stage.say(
    'Two faces only needs two and a half seconds.',
    'A second person on camera is a stronger signal than a candidate glancing away, so it is graded HIGH.',
    { hold: 0 }
  );
  const gotMultiple = await extras.crowd.waitForViolation('MULTIPLE_FACES');
  log(`off-camera candidate raised MULTIPLE_FACES: ${gotMultiple}`);

  await stage.reveal(page.getByText('Live violations').first());
  await stage.spot(page.getByText('Live violations').first().locator('../..'), { pad: 4 });
  await stage.say(
    'MULTIPLE_FACES — two faces on one camera. HIGH severity.',
    'Both of these came from real detector output, not a simulated event.',
    { tone: 'bad', hold: 4600 }
  );
  await stage.unspot();

  await stage.reveal(page.getByText('Candidates').first());
  await stage.spot(page.locator('tbody').first(), { pad: 4 });
  await stage.say(
    'Three attempts on one exam.',
    'In-progress rows show a live countdown and how many answers are in.',
    { hold: 4000 }
  );
  await stage.unspot();

  await stage.say('Both of them submit.', null, { hold: 1400 });
  await Promise.all([extras.empty.submit(), extras.crowd.submit()]);
  await sleep(1800);
  await stage.spot(page.locator('tbody').first(), { pad: 4 });
  await stage.say('Statuses flipped to Submitted, live.', null, { tone: 'good', hold: 3200 });
  await stage.unspot();
}

async function sceneReport(stage) {
  const { page } = stage;
  await stage.chapter('9 / 9 — The report');
  const row = page.locator('tbody tr', { hasText: CANDIDATE.email });
  await row.first().waitFor({ timeout: 20000 });
  await stage.click(row.first());
  await page.waitForURL(/\/sessions\/[a-f\d]{24}$/, { timeout: 20000 });
  await page.getByText('Attempt details').waitFor({ timeout: 20000 });
  await page.getByText('Answer review').waitFor({ timeout: 20000 });
  await stage.beat(1000);

  const summary = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  log(`report shows 30/50: ${summary.includes('30/50')} · 60%: ${/60%/.test(summary)}`);

  await stage.spot(page.getByText('Score', { exact: true }).first().locator('../..'), { pad: 4 });
  await stage.say(
    'Marked on the server: 30 out of 50.',
    'The client never computes a score, so a tampered browser cannot change one.',
    { tone: 'good', hold: 4400 }
  );
  await stage.unspot();

  await stage.reveal(page.getByText('Attempt details').first());
  await stage.spot(page.getByText('Attempt details').first().locator('../..'), { pad: 4 });
  await stage.say(
    'Identity, timings, last seen and the session id.',
    null,
    { hold: 3000 }
  );
  await stage.unspot();

  await stage.reveal(page.getByText(/^Violations \(/).first());
  await stage.spot(page.getByText(/^Violations \(/).first().locator('../..'), { pad: 4 });
  await stage.say(
    'The violation timeline for this attempt.',
    'Server-recorded timestamps and server-assigned severities.',
    { hold: 4000 }
  );
  await stage.unspot();

  await stage.reveal(page.getByText('Answer review').first());
  await stage.spot(page.getByText('Answer review').first().locator('../..'), { pad: 4 });
  await stage.say(
    'Answer review, admin-only.',
    'Each question shows the key, what the candidate chose, and the marks awarded.',
    { hold: 4400 }
  );
  await stage.unspot();
  await stage.scrollBy(320);
  await stage.beat(1600);
}

async function sceneWrap(stage) {
  const { page } = stage;
  await stage.click(page.getByRole('link', { name: 'Dashboard', exact: true }).first());
  await page.getByText('Total exams').first().waitFor({ timeout: 20000 });
  await stage.beat(900);
  await stage.click(page.getByRole('button', { name: /^refresh$/i }).first());
  await stage.beat(1400);

  await stage.say('Back to the dashboard. The totals moved with the run.', null, { hold: 2800 });
  for (const label of ['Completed attempts', 'Average score', 'Violations']) {
    await stage.spot(page.getByText(label, { exact: true }).first().locator('../..'), { pad: 4 });
    await stage.beat(1100);
  }
  await stage.unspot();

  await stage.reveal(page.getByText('Violations by type').first());
  await stage.spot(page.getByText('Violations by type').first().locator('../..'), { pad: 4 });
  await stage.say('And the events from this run, grouped by type.', null, { hold: 3200 });
  await stage.unspot();
  await stage.hush();
  await stage.chapter(null);

  await stage.cover(
    {
      brand: true,
      title: 'That was the whole product.',
      items: [
        'Exam authoring, candidate links and server-side marking',
        'On-device face detection — no video or audio leaves the browser',
        'Tab, fullscreen, audio and device rules with grace periods and cooldowns',
        'Socket.io delivery to the admin, with a REST fallback',
        'Scoped session tokens: candidates get no admin access and no answer key',
      ],
      footer: 'Arshpreet Singh · arshpreet.singh.dev@gmail.com',
      voice:
        'That was the whole product. Exam authoring, server-side marking, on-device detection, ' +
        'and live delivery to the admin. ' +
        "Thanks for watching. I'm Arshpreet Singh, and my email is on screen.",
    },
    2500
  );
  await stage.beat(1500); // let the last line breathe before recording stops
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

async function main() {
  await preflight();

  const release = keepAwake();
  process.once('exit', release);

  fs.mkdirSync(OUT, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proctora-demo-'));

  // Narration is rendered before the browser starts so the director can hold
  // each caption for exactly as long as its line takes to speak.
  const narrator = new Narrator({
    dir: path.join(OUT, '.voice-cache'),
    voice: VOICE,
    rate: Number(process.env.DEMO_VOICE_RATE ?? 0),
    rateScale: VOICE_SCALE,
  });
  const warmed = narrator.prewarm();
  log(
    `narration: voice=${VOICE} (${narrator.voiceName}) · scale=${VOICE_SCALE} · ` +
      `${warmed} line(s) rendered up front`
  );
  if (demoSpeed !== 1) {
    log('NOTE: DEMO_SPEED is not 1, so caption holds are shortened and narration will overlap.');
  }

  log('rendering synthetic camera clips…');
  const painter = await chromium.launch({ headless: true });
  const clips = await buildCameraClips(painter, workDir);
  await painter.close();
  log(`camera clips: ${Object.keys(clips).join(', ')}`);

  const launchArgs = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${clips['one-face']}`,
    '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars',
    `--window-size=${VIEW.width},${VIEW.height}`,
  ];

  // `channel: 'chromium'` selects the full browser instead of the headless
  // shell, which is what makes the Fullscreen API work while still headless.
  let browser;
  try {
    browser = await chromium.launch({ headless: !HEADFUL, channel: 'chromium', args: launchArgs });
  } catch (error) {
    log(`full chromium channel unavailable (${error.message}); falling back`);
    browser = await chromium.launch({ headless: !HEADFUL, args: launchArgs });
  }

  const context = await browser.newContext({
    viewport: VIEW,
    permissions: ['camera', 'microphone'],
    recordVideo: { dir: workDir, size: VIEW },
    reducedMotion: 'no-preference',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB });
  await context.addInitScript(installOverlay);

  const page = await context.newPage();
  // Video capture begins with the page, so this is the zero point the narration
  // timeline is measured against.
  const startedAt = Date.now();
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  page.on('pageerror', (error) => console.error('  [page error]', error.message));

  const stage = new Stage(page, { startedAt, narrator, pauseMs: PAUSE_MS });
  await stage.prime();

  const extras = {};
  let videoPath = null;
  let recordedMs = 0;

  try {
    await scene('intro', () => sceneIntro(stage));
    await scene('title', () => sceneTitle(stage));
    await scene('admin login', () => sceneAdminLogin(stage));
    await scene('dashboard', () => sceneDashboard(stage));
    await scene('exams list', () => sceneExamsList(stage));
    const examId = await scene('create exam', () => sceneCreateExam(stage));
    const examUrl = `${WEB}/exam/${examId}`;
    await scene('exam link', () => sceneExamLink(stage, examId));

    await scene('candidate details', () => sceneCandidateDetails(stage, examUrl));
    await scene('system check', () => sceneSystemCheck(stage));
    const wasFullscreen = await scene('exam', () => sceneExam(stage));
    await scene('violations', () => sceneViolations(stage, wasFullscreen));

    await scene('submit', () => sceneSubmit(stage));

    // Started only now: two extra Chromium instances loading MediaPipe would
    // otherwise compete with the page being filmed and visibly stutter it.
    const warmup = Promise.all([
      openCandidate({
        clip: clips['no-face'],
        name: 'Meera Iyer',
        email: `meera.iyer.${Date.now()}@example.com`,
        examUrl,
      }),
      openCandidate({
        clip: clips['two-faces'],
        name: 'Rohit Verma',
        email: `rohit.verma.${Date.now()}@example.com`,
        examUrl,
      }),
    ]);

    await scene('live monitoring', () => sceneLiveMonitoring(stage, examId, extras, warmup));
    await scene('report', () => sceneReport(stage));
    await scene('wrap up', () => sceneWrap(stage));
  } finally {
    stage.closeCue();
    recordedMs = Date.now() - startedAt;
    for (const extra of Object.values(extras)) await extra.close();

    const video = page.video();
    await context.close(); // flushes the video file
    await browser.close();
    if (video) videoPath = await video.path().catch(() => null);
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error('\n✕ Playwright did not produce a video file.');
    process.exit(1);
  }

  const silent = path.join(OUT, `${OUT_NAME}-silent.webm`);
  fs.copyFileSync(videoPath, silent);

  /* --------------------------- narration track --------------------------- */
  const produced = [silent];
  let narrationNote = 'no narration produced';
  try {
    narrator.persist();
    const wav = path.join(OUT, `${OUT_NAME}-narration.wav`);
    const mixed = mixNarration(stage.cues, recordedMs, wav);
    produced.push(wav);
    log(
      `voice: ${narrator.voiceName} · ${stage.cues.length} lines · ` +
        `${narrator.misses} rendered during the run · ${mixed.overlaps} overlapping`
    );
    reportPacing(stage.cues, recordedMs, mixed.spokenMs);

    const ffmpeg = findFfmpeg();
    if (ffmpeg) {
      log(`muxing with ${ffmpeg}`);
      const webm = path.join(OUT, `${OUT_NAME}.webm`);
      run(ffmpeg, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', videoPath,
        '-i', wav,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '96k',
        '-shortest', webm,
      ]);
      produced.push(webm);

      if (process.env.DEMO_MP4 !== 'false') {
        const mp4 = path.join(OUT, `${OUT_NAME}.mp4`);
        log('encoding mp4 (h.264 + aac) — this is the slow step');
        run(ffmpeg, [
          '-y', '-hide_banner', '-loglevel', 'error',
          '-i', videoPath,
          '-i', wav,
          '-map', '0:v:0', '-map', '1:a:0',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '160k',
          '-movflags', '+faststart', '-shortest', mp4,
        ]);
        produced.push(mp4);
      }
      narrationNote = `narrated with ${narrator.voiceName}`;
    } else {
      narrationNote =
        'narration.wav written, but ffmpeg was not found so it could not be muxed.\n' +
        '   Install it (winget install Gyan.FFmpeg) and re-run, or combine the two files\n' +
        '   yourself in any editor — narration.wav starts at the same instant as the video.';
    }
  } catch (error) {
    narrationNote = `narration failed: ${error.message}`;
    console.error(`  ! ${narrationNote}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const primary =
    produced.findLast((file) => file.endsWith('.mp4') || file.endsWith(`${OUT_NAME}.webm`)) ?? silent;
  const archive = path.join(OUT, `${OUT_NAME}-${stamp}${path.extname(primary)}`);
  fs.copyFileSync(primary, archive);
  fs.rmSync(workDir, { recursive: true, force: true });

  const mb = (fs.statSync(primary).size / 1024 / 1024).toFixed(1);

  console.log('\n Scene budget');
  for (const { name, seconds } of [...timings].sort((a, b) => b.seconds - a.seconds)) {
    console.log(`   ${String(seconds.toFixed(1)).padStart(6)}s  ${name}`);
  }
  const total = timings.reduce((sum, t) => sum + t.seconds, 0);
  console.log(`   ${String(total.toFixed(1)).padStart(6)}s  total`);

  if (demoSpeed !== 1) {
    // Pauses were divided by DEMO_SPEED; everything else (page loads, detector
    // grace periods, socket waits) ran at real time either way.
    const scripted = budget.scriptedMs / 1000;
    const fixed = total - scripted / demoSpeed;
    const projected = fixed + scripted;
    const mmss = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
    console.log(
      `\n Rehearsal at DEMO_SPEED=${demoSpeed}. At full pace this would run about ${mmss(projected)}` +
        ` (${mmss(fixed)} unavoidable waits + ${mmss(scripted)} scripted pauses).`
    );
  }

  console.log('\n────────────────────────────────────────────────');
  console.log(' Demo recorded');
  console.log('────────────────────────────────────────────────');
  for (const file of produced) console.log(` ${file}`);
  console.log(` ${archive}   (archived copy of this run)`);
  console.log(` ${VIEW.width}x${VIEW.height} · ${mb} MB · ${narrationNote}`);
  console.log('────────────────────────────────────────────────\n');
  release();
}

main().catch(async (error) => {
  console.error('\ndemo recording failed:', error);
  process.exit(1);
});
