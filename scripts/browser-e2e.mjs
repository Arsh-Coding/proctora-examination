/**
 * Full browser end-to-end test of the PROCTORA MVP.
 *
 * Drives the real UI in Chromium with a synthetic camera/microphone, so the whole
 * chain is exercised: admin login -> exam creation -> exam link -> candidate
 * system check -> face detection -> tab switch -> fullscreen exit -> answers ->
 * submission -> scoring -> admin report -> live violation feed.
 *
 * Prerequisites: MongoDB running, API on :5000, Vite dev server on :5173, seeded admin.
 *   node scripts/browser-e2e.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB = process.env.WEB_BASE ?? 'http://localhost:5173';
const HEADLESS = process.env.HEADFUL !== 'true';

/**
 * Writes a solid-grey Y4M clip used as Chromium's fake webcam.
 * A flat frame contains no face, which is the deterministic equivalent of a
 * candidate covering the camera - exactly what NO_FACE is meant to catch.
 */
function writeBlankCameraClip() {
  const width = 320;
  const height = 240;
  const frames = 12;
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F25:1 Ip A1:1 C420jpeg\n`, 'ascii');
  const frameTag = Buffer.from('FRAME\n', 'ascii');
  const y = Buffer.alloc(width * height, 128);
  const u = Buffer.alloc((width / 2) * (height / 2), 128);
  const v = Buffer.alloc((width / 2) * (height / 2), 128);

  const parts = [header];
  for (let i = 0; i < frames; i += 1) parts.push(frameTag, y, u, v);

  const file = path.join(os.tmpdir(), 'proctora-blank-camera.y4m');
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

const ADMIN = { email: 'admin@proctora.local', password: 'Admin@123' };
const CANDIDATE = {
  name: 'Playwright Candidate',
  email: `pw.${Date.now()}@example.com`,
};

let pass = 0;
const failures = [];

function ok(label, condition, extra) {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL  ${label}`, extra === undefined ? '' : extra);
  }
}

function note(label, value) {
  console.log(`info  ${label}: ${value}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const blankClip = writeBlankCameraClip();
  note('fake camera source', blankClip);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${blankClip}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  /* ----------------------------- admin context ---------------------------- */
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await adminContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB });
  const admin = await adminContext.newPage();
  admin.on('pageerror', (error) => console.error('   [admin page error]', error.message));

  await admin.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  ok('admin login page renders', await admin.getByRole('heading', { name: /sign in to the console/i }).isVisible());

  await admin.getByRole('button', { name: /fill demo credentials/i }).click();
  await admin.getByRole('button', { name: /^sign in$/i }).click();
  await admin.waitForURL('**/dashboard', { timeout: 20000 });
  ok('admin signs in and reaches the dashboard', admin.url().includes('/dashboard'));

  await admin.getByText('Total exams').first().waitFor({ timeout: 15000 });
  ok('dashboard shows live stat cards', await admin.getByText('Average score').first().isVisible());
  const liveBadge = await admin.getByText(/^Live$/).first().isVisible().catch(() => false);
  ok('dashboard reports a live socket connection', liveBadge);

  /* --------------------------- create a 5Q exam --------------------------- */
  await admin.goto(`${WEB}/exams/create`, { waitUntil: 'networkidle' });
  const examTitle = `Playwright E2E Exam ${new Date().toISOString().slice(11, 19)}`;
  await admin.getByLabel('Exam title').fill(examTitle);
  await admin.getByLabel('Description').fill('Created by scripts/browser-e2e.mjs');
  await admin.getByLabel('Duration (minutes)').fill('20');

  for (let i = 0; i < 4; i += 1) {
    await admin.getByRole('button', { name: /add question/i }).click();
  }
  const questionBlocks = admin.locator('fieldset');
  ok('question builder holds 5 questions', (await questionBlocks.count()) === 5, await questionBlocks.count());

  // Every question: options A..D, correct answer A, 10 marks.
  for (let q = 0; q < 5; q += 1) {
    const block = questionBlocks.nth(q);
    await block.locator('textarea').fill(`E2E question ${q + 1}: pick option A`);
    for (const [index, letter] of ['A', 'B', 'C', 'D'].entries()) {
      await block.getByLabel(`Option ${letter}`).fill(`Choice ${letter} for Q${q + 1} (${index})`);
    }
    await block.getByRole('radio', { name: 'A' }).click();
    await block.getByLabel('Marks').fill('10');
  }

  await admin.getByRole('button', { name: /^create exam$/i }).first().click();
  await admin.waitForURL(/\/exams\/[a-f\d]{24}$/, { timeout: 20000 });
  const examId = admin.url().split('/exams/')[1];
  ok('exam saved and detail page opened', /^[a-f\d]{24}$/.test(examId), examId);
  note('exam id', examId);

  await admin.getByText('Candidate exam link').waitFor();
  ok('exam totals are correct (5 questions / 50 marks)',
    (await admin.getByText('50').first().isVisible()) && (await admin.getByText('Total marks').first().isVisible()));

  await admin.getByRole('button', { name: /copy exam link/i }).first().click();
  const clipboard = await admin.evaluate(() => navigator.clipboard.readText());
  const expectedLink = `${WEB}/exam/${examId}`;
  ok(`copy exam link puts the URL on the clipboard (${clipboard})`, clipboard === expectedLink, clipboard);

  /* Keep the exam monitoring page open to prove real-time updates. */
  const monitor = await adminContext.newPage();
  await monitor.goto(`${WEB}/exams/${examId}/sessions`, { waitUntil: 'networkidle' });
  await monitor.getByText(/^Live$/).first().waitFor({ timeout: 15000 });
  ok('admin monitoring page connected live', true);
  const monitorBaselineRows = await monitor.locator('tbody tr').count();

  /* --------------------------- candidate context -------------------------- */
  const candidateContext = await browser.newContext({
    viewport: { width: 1366, height: 820 },
    permissions: ['camera', 'microphone'],
  });
  const candidate = await candidateContext.newPage();
  const consoleErrors = [];
  candidate.on('pageerror', (error) => consoleErrors.push(error.message));

  await candidate.goto(expectedLink, { waitUntil: 'networkidle' });
  ok('candidate opens the exam link without an account',
    await candidate.getByText('Step 1 — Candidate information').isVisible());

  await candidate.getByLabel('Full name').fill(CANDIDATE.name);
  await candidate.getByLabel('Email').fill(CANDIDATE.email);
  await candidate.getByRole('button', { name: /continue to system check/i }).click();
  ok('step 2 system check shown', await candidate.getByText('Step 2 — System check').isVisible());

  const startButton = candidate.getByRole('button', { name: /^start exam$/i });
  ok('exam cannot start before the checks pass', await startButton.isDisabled());

  await candidate.getByRole('button', { name: /allow camera & microphone/i }).click();

  // Wait for camera + mic + face detector to come up.
  await candidate.getByText('Video stream is live.').waitFor({ timeout: 25000 });
  ok('camera check passes', true);
  await candidate.getByText('Audio stream is live.').waitFor({ timeout: 15000 });
  ok('microphone check passes', true);

  const faceDetail = candidate.locator('li', { hasText: 'Face detection' }).first();
  await faceDetail.waitFor();
  let faceText = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    faceText = (await faceDetail.innerText()).replace(/\s+/g, ' ');
    if (/frames analysed|no face is visible|unavailable/i.test(faceText)) break;
    await sleep(1000);
  }
  note('face detection check', faceText);
  ok('on-device face detector loaded and is analysing frames',
    /frames analysed|no face is visible/i.test(faceText), faceText);

  await candidate.waitForFunction(
    () => {
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim().toLowerCase() === 'start exam'
      );
      return button && !button.disabled;
    },
    { timeout: 20000 }
  );
  ok('start button unlocks once required checks pass', true);

  await startButton.click();
  await candidate.getByText(/Time Left:/).waitFor({ timeout: 20000 });
  ok('exam started and the timer is visible', true);

  const firstClock = await candidate.getByText(/Time Left:/).innerText();
  note('initial clock', firstClock.trim());
  await sleep(2500);
  const secondClock = await candidate.getByText(/Time Left:/).innerText();
  ok(`timer is counting down (${firstClock.trim()} -> ${secondClock.trim()})`, firstClock !== secondClock);

  const inFullscreen = await candidate.evaluate(() => Boolean(document.fullscreenElement));
  note('entered fullscreen', String(inFullscreen));

  /* ------------------------------ answer 4/5 ------------------------------ */
  // Q1..Q3 -> option A (correct), Q4 -> option B (wrong), Q5 left blank.
  const picks = ['A', 'A', 'A', 'B'];
  for (let q = 0; q < picks.length; q += 1) {
    await candidate.getByRole('heading', { name: new RegExp(`Question ${q + 1} of 5`) }).waitFor();
    await candidate.locator('label', { hasText: new RegExp(`^${picks[q]}\\.`) }).first().click();
    await candidate.getByRole('button', { name: /^next$/i }).click();
  }
  await candidate.getByText('4 of 5 answered').first().waitFor({ timeout: 10000 });
  ok('answers are tracked (4 of 5 answered)', true);

  await candidate.getByText(/^Saved$/).waitFor({ timeout: 10000 });
  ok('answers autosave to the server while the exam is running', true);

  /* ---------------------------- tab switch rule --------------------------- */
  const eventsPanel = candidate.locator('div', { hasText: /Recorded events/ }).first();
  const readEvents = async () => (await eventsPanel.innerText()).replace(/\s+/g, ' ');
  const waitForEvent = async (type, attempts = 20, delay = 700) => {
    let text = '';
    for (let i = 0; i < attempts; i += 1) {
      text = await readEvents();
      if (text.includes(type)) return { found: true, text };
      await sleep(delay);
    }
    return { found: false, text };
  };

  // Preferred trigger: genuinely activate another tab.
  const decoy = await candidateContext.newPage();
  await decoy.goto('about:blank');
  await decoy.bringToFront();
  await sleep(1500);
  const visibilityWhileAway = await candidate.evaluate(() => document.visibilityState);
  note('exam page visibilityState while another tab is focused', visibilityWhileAway);
  await candidate.bringToFront();
  await sleep(1000);

  let tabResult = await waitForEvent('TAB_SWITCH', 6, 500);

  if (!tabResult.found) {
    // Chromium under automation keeps background tabs reported as "visible", so
    // Playwright cannot drive a native tab switch. Dispatch the real `blur`
    // event the app listens for instead of stubbing any app internals.
    note(
      'tab switch',
      'automation kept the page "visible", so the native tab switch could not be driven; ' +
        'dispatching a real window blur event (the same listener the app uses)'
    );
    await candidate.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sleep(800);
    tabResult = await waitForEvent('TAB_SWITCH', 12, 600);
  }

  ok('TAB_SWITCH violation raised when the candidate leaves the exam window',
    tabResult.found, tabResult.text);
  ok('candidate sees the tab-switch warning banner',
    (await candidate.getByText(/You left the exam window/i).count()) > 0);
  let recorded = tabResult.text;

  /* -------------------------- fullscreen exit rule ------------------------ */
  if (inFullscreen) {
    await candidate.evaluate(() => document.exitFullscreen?.());
    const fsResult = await waitForEvent('FULLSCREEN_EXIT');
    recorded = fsResult.text;
    ok('FULLSCREEN_EXIT violation raised on leaving fullscreen', fsResult.found, fsResult.text);
    ok('candidate is prompted to return to fullscreen',
      (await candidate.getByText(/return to fullscreen mode/i).count()) > 0);
  } else {
    note('fullscreen', 'headless Chromium did not enter fullscreen; skipping FULLSCREEN_EXIT check');
  }

  /* ------------------------------ no-face rule ---------------------------- */
  // The fake camera plays a flat grey clip, so the detector never sees a face.
  const faceStrip = await candidate
    .locator('li', { hasText: /^Face/ })
    .first()
    .innerText()
    .catch(() => '');
  note('face signal in the status strip', faceStrip.replace(/\s+/g, ' '));

  const noFaceResult = await waitForEvent('NO_FACE', 30, 1000);
  recorded = noFaceResult.text;
  ok('NO_FACE violation raised from real face-detection output', noFaceResult.found, noFaceResult.text);
  note('candidate event log', recorded.slice(0, 400));
  ok('violations report as persisted (saved) on the candidate side',
    (recorded.match(/saved/g) ?? []).length >= 2, recorded);

  /* ------------------- real-time delivery to the admin ------------------- */
  const feedText = await monitor.locator('body').innerText();
  ok('admin monitoring page received violations live (no refresh)',
    /TAB_SWITCH|NO_FACE|FULLSCREEN_EXIT/.test(feedText));
  const monitorRows = await monitor.locator('tbody tr').count();
  ok(`admin monitoring page picked up the new attempt live (${monitorBaselineRows} -> ${monitorRows} rows)`,
    monitorRows > monitorBaselineRows);
  ok('admin sees the candidate name in the live table', feedText.includes(CANDIDATE.name));

  /* -------------------------------- submit ------------------------------- */
  await candidate.getByRole('button', { name: /submit exam/i }).first().click();
  await candidate.getByRole('heading', { name: /are you sure you want to submit/i }).waitFor();
  ok('submit confirmation dialog appears', true);
  ok('dialog reports the unanswered question',
    (await candidate.getByText(/leaving 1 blank/i).count()) > 0);

  await candidate.getByRole('button', { name: /^cancel$/i }).click();
  await sleep(300);
  ok('cancel keeps the candidate in the exam',
    (await candidate.getByText(/Time Left:/).count()) > 0);

  await candidate.getByRole('button', { name: /submit exam/i }).first().click();
  await candidate.getByRole('button', { name: /^submit$/i }).click();
  await candidate.getByRole('heading', { name: /exam submitted successfully/i }).waitFor({ timeout: 20000 });
  ok('candidate sees the submission confirmation', true);
  ok('confirmation does not leak the answer key',
    !(await candidate.locator('body').innerText()).toLowerCase().includes('correct answer'));

  /* --------------------------- admin verification ------------------------ */
  await sleep(800);
  const monitorAfterSubmit = await monitor.locator('body').innerText();
  ok('admin monitoring page shows the submission live', /Submitted/.test(monitorAfterSubmit));

  await admin.goto(`${WEB}/exams/${examId}/sessions`, { waitUntil: 'networkidle' });
  const row = admin.locator('tbody tr', { hasText: CANDIDATE.email });
  await row.first().waitFor({ timeout: 15000 });
  const rowText = (await row.first().innerText()).replace(/\s+/g, ' ');
  note('admin attempts row', rowText);
  ok('admin attempt list shows the candidate', rowText.includes(CANDIDATE.name));
  ok('admin attempt list shows the score 30/50 (60%)', rowText.includes('30/50') && rowText.includes('60%'), rowText);

  await row.first().click();
  await admin.waitForURL(/\/sessions\/[a-f\d]{24}$/, { timeout: 15000 });
  // Wait for the detail view itself to render before reading its text.
  await admin.getByText('Answer review').waitFor({ timeout: 15000 });
  await admin.getByText('Attempt details').waitFor({ timeout: 15000 });
  const detail = (await admin.locator('body').innerText()).replace(/\s+/g, ' ');
  note('session detail summary', detail.slice(0, 320));
  ok('session detail shows the candidate identity', detail.includes(CANDIDATE.name) && detail.includes(CANDIDATE.email));
  ok('session detail shows score 30/50', detail.includes('30/50'));
  ok('session detail shows the percentage', /60%/.test(detail));
  ok('session detail lists violations', /TAB_SWITCH|NO_FACE/.test(detail));
  ok('session detail marks the attempt submitted', /Submitted/.test(detail));
  ok('answer review reveals the key to the admin', /correct/i.test(detail));

  /* --------------------------- resubmission guard ------------------------ */
  const repeat = await candidateContext.newPage();
  await repeat.goto(expectedLink, { waitUntil: 'networkidle' });
  await repeat.getByLabel('Full name').fill(CANDIDATE.name);
  await repeat.getByLabel('Email').fill(CANDIDATE.email);
  await repeat.getByRole('button', { name: /continue to system check/i }).click();
  await repeat.getByRole('button', { name: /allow camera & microphone/i }).click();
  await repeat.getByText('Video stream is live.').waitFor({ timeout: 25000 });
  await repeat.waitForFunction(
    () => {
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim().toLowerCase() === 'start exam'
      );
      return button && !button.disabled;
    },
    { timeout: 20000 }
  );
  await repeat.getByRole('button', { name: /^start exam$/i }).click();
  await repeat.getByText(/already submitted an attempt/i).waitFor({ timeout: 15000 });
  ok('a second attempt with the same email is refused', true);

  ok(`no uncaught page errors in the candidate app (${consoleErrors.length})`,
    consoleErrors.length === 0, consoleErrors);

  await browser.close();

  console.log(`\n${pass} assertions passed, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.error('Failed assertions:');
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('\nbrowser e2e crashed:', error);
  process.exit(1);
});
