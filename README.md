# PROCTORA

Online exam platform with browser-based remote proctoring.

An admin creates an exam, shares a link, a candidate takes it under camera/microphone/browser
monitoring, and the admin sees the score and every recorded violation — live, without refreshing.

Built with **React + TypeScript** on the front end and **Express + TypeScript** on the back end.
All proctoring runs on-device in the browser. No paid or external AI service is required.

---

## 1. Project overview

| Area | What it does |
| --- | --- |
| Admin console | Register/login, create and edit exams, generate candidate links, monitor live attempts, review scores and violations |
| Candidate app | Open a link (no account), enter details, pass a system check, take the exam under proctoring, submit |
| Proctoring | On-device face detection, multiple-face detection, no-face detection, microphone level monitoring, tab-switch detection, fullscreen-exit detection, camera/mic availability monitoring |
| Real time | Violations travel candidate browser → Socket.io → MongoDB → admin dashboard |
| Scoring | Server-side marking on submit; candidates never receive the answer key |

### Tech stack

**Client** — React 19, TypeScript, Vite, React Router, Tailwind CSS v4, Axios, socket.io-client,
MediaPipe Tasks Vision (BlazeFace), Web Audio API, Fullscreen API, Page Visibility API.

**Server** — Node.js, Express 5, TypeScript, MongoDB + Mongoose 8, Socket.io 4, JWT, bcrypt
(`bcryptjs`), Helmet, CORS, express-rate-limit, Zod validation.

> **Note on TypeScript.** The original brief asked for plain JavaScript. This build uses TypeScript
> for both apps as explicitly requested. Everything else follows the brief.

---

## 2. Architecture

```
                              PROCTORA
                                  |
              ┌───────────────────┴───────────────────┐
              |                                       |
        ADMIN CONSOLE                          CANDIDATE APP
     (React, /dashboard …)                    (React, /exam/:id)
              |                                       |
              |                    ┌──────────────┬───┴────────┬─────────────┐
              |                    |              |            |             |
              |                 Camera        Microphone   Page Visibility  Fullscreen
              |                    |              |            |             |
              |            MediaPipe BlazeFace  Web Audio   TAB_SWITCH   FULLSCREEN_EXIT
              |            NO_FACE /             RMS level
              |            MULTIPLE_FACES        NOISE_DETECTED
              |                    └──────┬───────┘
              |                           |
              └───────────┬───────────────┘
                          |
                     Socket.io  (violation:report / violation:new)
                          |
                  Node.js + Express API
          ┌───────────────┼────────────────┬──────────────┐
       Auth API        Exam API        Session API    Violation API
          └───────────────┼────────────────┴──────────────┘
                          |
                       MongoDB
             (users, exams, examsessions, violations)
```

### Two token types

Candidates never create an account, so authorisation uses two different JWTs:

| Token | Issued by | Carries | Authorises |
| --- | --- | --- | --- |
| Admin token | `POST /api/auth/login` | `kind: ADMIN`, user id | Admin REST routes, admin Socket.io room |
| Exam-session token | `POST /api/exams/:id/start` | `kind: SESSION`, session id, exam id | Answer saves, submit, heartbeat and violation reports **for that one session only** |

Both are verified by the same secret. Middleware refuses a session token on admin routes and vice
versa, and a session token whose subject does not match the route's session id is rejected.

### Repository layout

```
Proctora/
├── package.json              root scripts (dev, seed, build, tests)
├── .env.example              environment reference
├── README.md
├── scripts/
│   └── browser-e2e.mjs       full-UI acceptance test (Playwright)
│
├── client/                   React + TypeScript + Vite
│   ├── public/
│   │   ├── mediapipe/wasm/   MediaPipe runtime (generated at install)
│   │   └── models/           BlazeFace .tflite model (generated at install)
│   ├── scripts/
│   │   └── setup-face-model.mjs
│   └── src/
│       ├── components/       ui/ · layout/ · admin/ · exam/
│       ├── context/          AuthContext, ToastContext
│       ├── hooks/            useProctoring, useFaceDetection, useNoiseDetection,
│       │                     useMediaStream, useTabVisibility, useFullscreen,
│       │                     useExamTimer, useAdminSocket, useCandidateSocket
│       ├── pages/            admin/ · candidate/
│       ├── services/         api, auth, exam, session, socket
│       ├── types/
│       └── utils/
│
└── server/                   Express + TypeScript
    ├── scripts/              smoke.mjs (REST), realtime.mjs (Socket.io)
    └── src/
        ├── config/           env, db, proctoring  ← all thresholds/severities
        ├── controllers/      auth, exam, session, violation, stats
        ├── middleware/       auth, validate, error, rateLimit
        ├── models/           User, Exam, ExamSession, Violation
        ├── routes/           auth, exam, session, violation
        ├── services/         scoring, session, violation
        ├── sockets/          index (gateway), realtime (broadcast registry)
        ├── seed/             seed.ts, questions.ts
        └── utils/
```

---

## 3. Requirements

- **Node.js 20 or newer** (developed on 22.17.0)
- **npm 10+**
- **MongoDB 6+** running locally, or a MongoDB Atlas connection string
- A recent **Chrome, Edge or Firefox** for the candidate app (needs `getUserMedia`, Web Audio and
  the Fullscreen API)
- Internet access **once**, at install time, to download the 224 KB face-detection model. After
  that everything runs offline.

---

## 4. Installation

```bash
cd Proctora
npm install
```

The root `npm install` also installs `server/` and `client/`, and the client's `postinstall`
prepares the face-detection assets:

- copies the MediaPipe WASM runtime into `client/public/mediapipe/wasm/`
- downloads `blaze_face_short_range.tflite` into `client/public/models/`

If the download is blocked, install still succeeds and the candidate system check reports face
detection as unavailable (the other proctoring signals keep working). To retry later:

```bash
cd client && npm run setup:models
```

---

## 5. MongoDB setup

**Local (default)**

```bash
# Windows: the MongoDB service is usually already running
Get-Service MongoDB

# macOS (Homebrew)
brew services start mongodb-community

# Docker
docker run -d --name proctora-mongo -p 27017:27017 mongo:7
```

The database `proctora` and its collections are created on first write — no manual setup needed.

**Atlas** — create a free cluster, allow your IP, then set:

```
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/proctora?retryWrites=true&w=majority
```

---

## 6. Environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### `server/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/proctora` | MongoDB connection string |
| `JWT_SECRET` | dev fallback | Signs admin and exam-session tokens. **Required in production.** |
| `JWT_EXPIRES_IN` | `12h` | Admin token lifetime |
| `SESSION_TOKEN_EXPIRES_IN` | `24h` | Exam-session token lifetime (must exceed your longest exam) |
| `CLIENT_URL` | `http://localhost:5173` | CORS + Socket.io origin allow-list, and the exam links printed by the seed |
| `EXTRA_ORIGINS` | – | Extra comma-separated allowed origins |
| `NODE_ENV` | `development` | Rate limiting and error detail behaviour |
| `ENABLE_RATE_LIMIT` | – | Set to `true` to enforce rate limits in development |

Generate a real secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### `client/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5000/api` | REST base URL |
| `VITE_SOCKET_URL` | `http://localhost:5000` | Socket.io origin |

---

## 7. Running locally

**From the repo root (recommended):**

```bash
npm install     # installs root + server + client, prepares face model
npm run seed    # creates the demo admin and demo exam
npm run dev     # starts API (:5000) and Vite (:5173) together
```

**Or one app at a time:**

```bash
cd server && npm install && npm run dev     # http://localhost:5000
cd client && npm install && npm run dev     # http://localhost:5173
```

**Production build:**

```bash
npm run build          # tsc -> server/dist, vite -> client/dist
npm start              # runs server/dist/index.js
```

Open <http://localhost:5173> and sign in.

> Camera and microphone need a secure context. `localhost` counts as secure, so plain HTTP is fine
> locally. To test from another device on your LAN you need HTTPS (or Chrome's
> "Insecure origins treated as secure" flag).

---

## 8. Demo admin credentials

```
Email:    admin@proctora.local
Password: Admin@123
```

**These are development/demo credentials only**, and they are published in this file, so treat any
database seeded with them as public. The login screen has a "Fill demo credentials" button.

To seed a deployed database with your own account instead, set either variable and the defaults are
not used:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='your-password' npm run seed
```

The password is not echoed when it comes from the environment. If you seed the published defaults
into a non-local database, the script prints a warning telling you to re-run with your own.

`npm run seed` also creates a demo exam:

```
Title:       JavaScript Fundamentals
Duration:    30 minutes
Questions:   20
Total marks: 100
```

`npm run seed:reset` wipes exams, sessions and violations first, then re-seeds.

---

## 9. How to create an exam

1. Sign in and go to **Exams → Create exam**.
2. Fill in **Exam title**, **Description** and **Duration (minutes)**.
3. For each question fill the text, Options A–D, click the letter of the **correct answer**, and set
   **Marks**.
4. Use **+ Add question** for more, the arrows to reorder, **Remove** to delete.
5. Click **Create exam**. It is validated server-side and saved to MongoDB.

Total marks are the sum of the per-question marks, so a 20 × 5 exam is out of 100.

---

## 10. How to generate an exam link

The link exists as soon as the exam is saved. On the exam detail page:

```
http://localhost:5173/exam/<examId>
```

Click **Copy Exam Link** to put it on the clipboard (there is also a copy button on each row of the
exams table), or **Open in new tab** to preview it.

Candidates need no account. Use **Close exam** to stop accepting new attempts; existing attempts in
progress are unaffected.

---

## 11. How to take an exam

1. Open the exam link (a separate browser or incognito window is a good way to test).
2. **Step 1 — Candidate information:** name and email. One attempt per email per exam.
3. **Step 2 — System check:** click **Allow camera & microphone** and grant permission. Checks:

   | Check | Required | Notes |
   | --- | --- | --- |
   | Camera | yes | A live video track |
   | Microphone | yes | A live audio track |
   | Browser support | yes | `getUserMedia` + `AudioContext` |
   | Fullscreen support | yes | `requestFullscreen` available |
   | Face detection | no | Warns instead of blocking if the model is missing |

   **Start exam** stays disabled until every required check passes. A camera preview with the live
   face-detection box and a microphone level meter are shown.
4. **Start exam** enters fullscreen and starts the server-side clock.
5. Answer questions, use **Previous/Next** or the numbered navigator. Answers autosave.
6. **Submit Exam** → confirmation dialog → **Submit**. The result screen confirms submission;
   scores and correct answers are not shown to candidates.

**Refresh or crash recovery:** the exam-session token is kept in `localStorage`. Reopening the link
restores the attempt, its saved answers and the remaining time (the clock never pauses).

---

## 12. How proctoring works

Everything runs in the candidate's browser. Nothing is uploaded except violation metadata — no
video or audio is recorded or transmitted.

| Violation | Severity | How it is detected |
| --- | --- | --- |
| `NO_FACE` | MEDIUM | MediaPipe BlazeFace finds 0 faces continuously for `noFaceGraceMs` (6 s) |
| `MULTIPLE_FACES` | HIGH | More than one face continuously for `multipleFacesGraceMs` (2.5 s) |
| `TAB_SWITCH` | MEDIUM | `visibilitychange` → hidden, or `window` `blur` while the document is visible |
| `FULLSCREEN_EXIT` | MEDIUM | `fullscreenchange` after having been fullscreen |
| `NOISE_DETECTED` | LOW | Web Audio RMS ≥ `noiseVolumeThreshold` for `noiseSustainMs` (3 s) |
| `NO_CAMERA` | HIGH | The video track ends, is muted or is disabled |
| `NO_MICROPHONE` | MEDIUM | The audio track ends, is muted or is disabled |

**Face detection** uses MediaPipe Tasks Vision with the BlazeFace short-range model, loaded from
`client/public`. The video frame is sampled every `faceDetectionIntervalMs` (1.2 s) and detections
below `faceMinConfidence` are discarded. If the model cannot load, the hook reports `unavailable`
and the system check says so — it never fakes a result.

**Audio** measures loudness only, via `AudioContext` → `AnalyserNode` → RMS. It does not recognise
speech, words or speakers.

**Reporting path.** A violation goes over Socket.io first (`violation:report`, acknowledged by the
server), and falls back to `POST /api/violations` if the socket is down, so nothing is lost. Either
way the server assigns the severity, stores the record, and broadcasts `violation:new` to the
admin's private room plus the exam and session rooms. The admin UI updates without refreshing.

**Warnings.** `TAB_SWITCH`, `FULLSCREEN_EXIT` and `MULTIPLE_FACES` consume the candidate's warning
budget and show `Warning 1/3`, `2/3`, … Past the limit the wording escalates. The MVP never
auto-terminates an attempt (`autoTerminateOnMaxWarnings: false`); violations are recorded for
review.

**Cooldowns.** Each type has a cooldown (e.g. 20 s for `NO_FACE`) so one long event produces one
record rather than hundreds.

**All of this is configured in one place:**
[`server/src/config/proctoring.ts`](server/src/config/proctoring.ts). The browser fetches it at
exam start, so changing a threshold or severity there changes both sides.

### Timer

Duration comes from the exam document. On start the server stores `expiresAt = startedAt + duration`
and only ever returns `remainingMs`. The browser countdown is re-anchored from every heartbeat, so
changing the machine clock buys no extra time. Independently, a server sweeper runs every 20 seconds
and auto-submits any expired attempt — even if the candidate closed the laptop. A late answer save
is rejected with `409` and closes the attempt.

---

## 13. API documentation

Base URL `http://localhost:5000/api`. All responses use `{ "success": boolean, "data": … }`, and
errors use `{ "success": false, "message": string, "details"?: [...] }`.

### Auth

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | – | `{ name, email, password }` → `{ token, user }`. Password needs 8+ chars with upper, lower and a digit. Rate limited. |
| `POST` | `/auth/login` | – | `{ email, password }` → `{ token, user }`. Rate limited. |
| `GET` | `/auth/me` | admin | Current user |

### Exams

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/exams` | admin | `{ title, description, duration, isActive?, questions[] }`. `correctAnswer` accepts an index (`1`) or a letter (`"B"`). |
| `GET` | `/exams` | admin | Your exams with attempt counts (question bodies omitted) |
| `GET` | `/exams/:id` | admin | Full exam **including the answer key** |
| `PUT` | `/exams/:id` | admin | Partial update |
| `DELETE` | `/exams/:id` | admin | Cascades to sessions and violations |
| `GET` | `/exams/:id/sessions` | admin | Attempts for one exam |
| `GET` | `/exams/:id/public` | – | Candidate landing info: title, description, duration, counts. **No questions.** |
| `POST` | `/exams/:id/start` | – | `{ candidateName, candidateEmail }` → `{ sessionToken, session, exam, proctoring }`. Resumes an in-progress attempt (`200`) or creates one (`201`). `409` if that email already submitted. |

### Sessions

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/sessions` | admin | All attempts across your exams |
| `GET` | `/sessions/:id` | admin | Attempt + violations + per-question review (with the key) |
| `GET` | `/sessions/:id/violations` | admin or that session | Violation list |
| `GET` | `/sessions/me` | session | Restore the current attempt (answers, `remainingMs`, questions) |
| `PATCH` | `/sessions/:sessionId/answers` | session | `{ answers: [{ questionId, selectedOption }] }`. Rejects foreign question ids and out-of-range options. `409` when time is up. |
| `POST` | `/sessions/:sessionId/submit` | session | `{ answers?, reason? }` → `{ score, totalMarks, percentage }`. Idempotent. |
| `POST` | `/sessions/:sessionId/heartbeat` | session | Liveness + `remainingMs` clock sync |

### Violations and misc

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/violations` | session | `{ type, timestamp?, metadata? }`. Severity is assigned server-side. Rate limited. |
| `GET` | `/proctoring/config` | – | Violation types, severities, labels, messages, thresholds |
| `GET` | `/stats/dashboard` | admin | Live totals, violations by type, recent attempts and violations |
| `GET` | `/health` | – | Liveness probe |

### Socket.io

Connect to the API origin with `auth: { token }` — an admin JWT or an exam-session token.

**Client → server**

| Event | Sender | Payload |
| --- | --- | --- |
| `admin:subscribe` | admin | `{ examId?, sessionId? }` (ownership checked) → ack `{ ok }` |
| `admin:unsubscribe` | admin | `{ examId?, sessionId? }` |
| `violation:report` | candidate | `{ type, timestamp?, metadata? }` → ack `{ ok, violation, violationCount }` |
| `candidate:heartbeat` | candidate | `{ faces, volume, fullscreen }` |

**Server → client**

| Event | Payload |
| --- | --- |
| `violation:new` | `{ violation, violationCount, candidate }` |
| `session:started` | `{ session }` |
| `session:submitted` | `{ session, reason }` |
| `candidate:online` / `candidate:offline` | `{ sessionId, examId, … }` |
| `candidate:heartbeat` | `{ sessionId, faces, volume, fullscreen, at }` |

---

## 14. Implemented features

**Auth & security**
- bcrypt password hashing (cost 12); the hash is `select: false` so it never leaks
- JWT admin auth plus scoped exam-session tokens; role authorisation middleware
- Helmet, CORS allow-list, rate limiting on auth (20/15 min) and violations (240/min)
- Zod validation on every body and route param; centralised error handler
- Ownership checks: an admin can only read/modify their own exams and sessions
- Correct answers are never included in any candidate response (asserted in the test suite)
- Secrets via environment variables; `JWT_SECRET` mandatory in production

**Admin**
- Register, login, session persistence across refresh, automatic sign-out on token expiry
- Dashboard: exams, active exams, unique candidates, completed attempts, in-progress attempts,
  average score, total violations, violations by type, recent attempts, live violation feed —
  all computed from the database
- Exam CRUD with a question builder (add, remove, reorder, per-question marks, correct answer)
- Open/close exams, copy exam link, delete with cascade
- Live attempt monitoring per exam and across all exams, with search and status filters
- Session report: identity, times, status, score, percentage, answered count, violation timeline,
  per-question answer review with the key, and live proctoring telemetry while an attempt runs

**Candidate**
- Account-free access by link; two-step onboarding; blocking system check with camera preview
- Fullscreen exam shell, server-anchored countdown, question navigator, autosave with retry
- Submit confirmation dialog, submission receipt, refresh/crash recovery
- One attempt per email per exam

**Proctoring**
- On-device face detection with a live bounding-box overlay and a frame counter
- No-face and multiple-face rules with configurable grace periods
- Microphone RMS metering with a sustained-loudness rule
- Tab-switch, fullscreen-exit and camera/microphone-loss rules
- Per-type cooldowns, warning budget, socket-first reporting with REST fallback

**UI**
- Responsive layout, dark admin sidebar with mobile drawer, cards, tables, status/severity badges,
  modals, toasts, loading/error/empty states
- Keyboard-accessible controls, labelled form fields, `aria-live` regions for warnings and toasts,
  `prefers-reduced-motion` respected

**Tooling**
- Root scripts to install, seed, run and build everything
- Three test suites: REST (47 assertions), Socket.io (29), full browser UI (45)

---

## 15. Known MVP limitations

- **Face detection is presence-only.** It counts faces. It does not verify identity, track gaze, or
  detect emotion. Poor lighting or an unusual camera angle can cause false `NO_FACE` events.
- **Audio is loudness-only.** No speech recognition, no speaker identification. A fan or traffic can
  trigger `NOISE_DETECTED`.
- **No recording.** Video and audio are analysed in memory and never stored or streamed, so there is
  no footage to review after the fact.
- **`TAB_SWITCH` cannot catch everything.** A second monitor, a phone or another device is invisible
  to the browser.
- **Fullscreen is not a lock.** A candidate can leave fullscreen; it is recorded, not prevented.
  Browsers also require a user gesture to re-enter.
- **Client-side detection is bypassable** by a determined candidate with devtools. Scoring, timing
  and violation storage are all server-side, but the detectors themselves are not tamper-proof.
- **Attempt identity is self-declared.** Name and email are typed by the candidate; there is no ID
  verification. Duplicate attempts are blocked by email only.
- **Single-node real time.** Socket.io uses the in-memory adapter, so horizontal scaling would need
  a Redis adapter.
- **No pagination.** `GET /api/sessions` caps at 500 rows; the dashboard caps its feeds.
- **No password reset, email delivery, or admin invitations.**
- **No automated unit tests** — verification is the three integration/E2E suites described below.
- **HTTPS required off localhost.** `getUserMedia` will not run on a plain-HTTP LAN address.

---

## 16. Future improvements

- Redis adapter for Socket.io plus horizontal scaling
- Optional session recording with retention policy and consent flow
- Question banks, randomised order, per-candidate question sampling, negative marking
- Descriptive/coding question types with manual grading
- ID verification and face matching against a reference photo
- Admin-side live video monitoring and a review queue for flagged attempts
- Candidate invitations by email with single-use tokens
- Reviewer roles, audit log, exportable reports (CSV/PDF)
- Unit tests plus Playwright in CI, and screenshot capture on failure
- i18n and a high-contrast theme

---

## 17. Deploying for free (Render + Vercel/Netlify + Atlas)

The root `npm run dev` is a local convenience only. It uses `concurrently` to run
two apps side by side, and **no hosting platform uses it**. You deploy the two
folders as two separate projects, each pointed at its own subdirectory.

```
   client/  ──>  Vercel or Netlify   (static files + CDN)
   server/  ──>  Render              (long-running Node process)
   MongoDB  ──>  MongoDB Atlas M0
```

The split is not arbitrary. Socket.io needs a connection that stays open for the
length of an exam. Vercel Functions gained WebSocket support in 2026 but still
drop connections after a few minutes, so the API has to run somewhere with a real
persistent process.

### Step 0 — Git

The project needs to be in a Git repository that Render and Vercel can read.

```bash
cd Proctora
git init
git add .
git commit -m "PROCTORA MVP"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Confirm `server/.env` and `client/.env` are **not** in that commit. Both are
gitignored, and real secrets go in each platform's dashboard instead.

### Step 1 — MongoDB Atlas

1. Create a free **M0** cluster.
2. Database Access: add a user with a strong password.
3. Network Access: allow `0.0.0.0/0`. Render's free tier has no static outbound
   IP, so you cannot allow-list it. This is the weakest link in the free setup:
   the database is reachable from anywhere and protected only by credentials.
4. Copy the SRV string and append the database name:
   `mongodb+srv://<user>:<pass>@<cluster>/proctora?retryWrites=true&w=majority`

### Step 2 — API on Render

New > Web Service, connect the repo, then:

| Setting | Value |
| --- | --- |
| Root Directory | `server` |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Environment variables:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGO_URI` | your Atlas SRV string |
| `JWT_SECRET` | a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `CLIENT_URL` | your frontend origin, filled in after step 3 |

Leave `PORT` alone: Render injects it and `config/env.ts` reads it.

There is a `render.yaml` blueprint at the repo root with these settings if you
prefer New > Blueprint over filling in the form.

### Step 3 — Client on Vercel or Netlify

**Vercel:** import the repo and set **Root Directory** to `client`. The framework
preset (Vite), build command and output directory are detected. Environment
variables:

```
VITE_API_URL     = https://<your-render-service>.onrender.com/api
VITE_SOCKET_URL  = https://<your-render-service>.onrender.com
```

**Netlify:** set **Base directory** to `client`. `client/netlify.toml` supplies
the build command, publish directory and redirects. Same two env vars.

`client/vercel.json` and `client/netlify.toml` both contain an SPA fallback that
rewrites unknown paths to `index.html`. Without it, `/exam/<id>` returns 404 on a
fresh load, which would break every exam link. Do not remove it.

### Step 4 — Close the loop

Go back to Render and set `CLIENT_URL` to your deployed frontend origin, with no
trailing slash, then redeploy. Until you do this, the browser will be blocked by
CORS and Socket.io will refuse the handshake.

Deploy previews get a fresh URL per build and will be rejected. Add specific ones
to `EXTRA_ORIGINS` (comma separated) if you need them.

### Step 5 — Seed the production database

Point the seed at Atlas from your machine, once, and supply your own credentials
so the published demo pair never reaches a public URL.

PowerShell:

```powershell
cd server
$env:MONGO_URI="<your atlas string>"
$env:SEED_ADMIN_EMAIL="you@example.com"
$env:SEED_ADMIN_PASSWORD="<a real password>"
npm run seed
```

bash:

```bash
cd server
MONGO_URI="<your atlas string>" \
SEED_ADMIN_EMAIL="you@example.com" \
SEED_ADMIN_PASSWORD="<a real password>" \
npm run seed
```

If you skip those two variables the script seeds `admin@proctora.local` /
`Admin@123`, which is printed in section 8 of this file. On a non-local database
it will warn you. Anyone who reads the repo could then sign in and view every
candidate's answers and violations.

### What the free tier costs you

- **Cold starts.** Render spins a free service down after 15 minutes without
  traffic, and waking takes roughly a minute. The first candidate to open a link
  after an idle period will sit on a loading state, and may see "Cannot reach the
  PROCTORA API". Reloading after a minute works. Once an exam is running, the
  candidate heartbeat every 15 seconds keeps the service awake.
- **750 instance hours per month.** One always-on free service exceeds this;
  spin-down is what keeps you under it.
- **The expiry sweeper pauses while spun down.** Attempts past their deadline are
  closed when the service next wakes, not on time. Client-side auto-submit still
  fires for anyone with the page open, so this only affects abandoned attempts.
- **512 MB RAM.** Fine for this workload.
- **No horizontal scaling.** Socket.io uses the in-memory adapter, so a second
  instance would not share rooms. Stay on one.

Do not run a real, consequential exam on this setup. Cold starts and a
publicly-reachable database are acceptable for a portfolio demo, not for an
assessment someone's grade depends on.

## 18. Commands reference

| Command | Run from | What it does |
| --- | --- | --- |
| `npm install` | root | Installs root, server and client; prepares face-detection assets |
| `npm run dev` | root | API on `:5000` + Vite on `:5173` |
| `npm run seed` | root | Creates the demo admin and demo exam |
| `npm run seed:reset` | root | Wipes exams/sessions/violations, then re-seeds |
| `npm run build` | root | Builds both apps |
| `npm start` | root | Runs the compiled API |
| `npm run typecheck` | root | Type-checks both apps |
| `npm run test:api` | root | REST integration suite |
| `npm run test:realtime` | root | Socket.io real-time suite |
| `npm run test:browser` | root | Full-UI acceptance test (needs `npx playwright install chromium`) |
| `npm run test:e2e` | root | All three suites |
| `npm run dev` | `server/` | API only, with watch |
| `npm run dev` | `client/` | Vite only |
| `npm run setup:models` | `client/` | Re-prepare the face-detection assets |

The test suites expect the API (and, for the browser suite, the Vite dev server) to be running, with
`npm run seed` already applied.
# proctora-examination
