import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logo } from '../../components/layout/Logo';
import { CameraPreview } from '../../components/exam/CameraPreview';
import { ProctorStatusStrip } from '../../components/exam/ProctorStatusStrip';
import { ProctorWarnings } from '../../components/exam/ProctorWarnings';
import { QuestionNavigator } from '../../components/exam/QuestionNavigator';
import { SystemCheckList } from '../../components/exam/SystemCheck';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState, InlineAlert } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useCandidateSocket } from '../../hooks/useCandidateSocket';
import { useLatest } from '../../hooks/useLatest';
import { useExamTimer } from '../../hooks/useExamTimer';
import { useMediaStream } from '../../hooks/useMediaStream';
import { useProctoring } from '../../hooks/useProctoring';
import { ApiRequestError } from '../../services/api';
import { candidateService } from '../../services/session.service';
import type { AnswerPatch } from '../../services/session.service';
import type {
  CandidateExam,
  CandidateSession,
  ProctoringThresholds,
  PublicExam,
  SubmitResult,
} from '../../types';
import { formatDuration, formatMinutes, optionLetter } from '../../utils/format';
import { examSessionStore } from '../../utils/storage';
import { allRequiredPassed } from '../../utils/systemCheck';
import type { CheckItem, CheckState } from '../../utils/systemCheck';

type Phase = 'loading' | 'details' | 'syscheck' | 'exam' | 'submitted' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CandidateExamPage() {
  const { examId = '' } = useParams<{ examId: string }>();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>(examId ? 'loading' : 'error');
  const [fatalError, setFatalError] = useState<string | null>(
    examId ? null : 'No exam id in the link.'
  );

  const [publicExam, setPublicExam] = useState<PublicExam | null>(null);
  const [thresholds, setThresholds] = useState<ProctoringThresholds | null>(null);

  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [formErrors, setFormErrors] = useState<{ name?: string; email?: string }>({});
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [session, setSession] = useState<CandidateSession | null>(null);
  const [exam, setExam] = useState<CandidateExam | null>(null);
  const [resumed, setResumed] = useState(false);

  const [answers, setAnswers] = useState<Map<string, number | null>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const media = useMediaStream();
  const { socket, connected: socketConnected } = useCandidateSocket(
    phase === 'exam' ? sessionToken : null
  );

  const effectiveThresholds: ProctoringThresholds = useMemo(
    () =>
      thresholds ?? {
        faceDetectionIntervalMs: 1200,
        noFaceGraceMs: 6000,
        multipleFacesGraceMs: 2500,
        faceMinConfidence: 0.5,
        noiseVolumeThreshold: 0.14,
        noiseSustainMs: 3000,
        violationCooldownMs: {
          NO_FACE: 20000,
          MULTIPLE_FACES: 20000,
          TAB_SWITCH: 1500,
          FULLSCREEN_EXIT: 3000,
          NO_CAMERA: 30000,
          NO_MICROPHONE: 30000,
          NOISE_DETECTED: 30000,
        },
        maxWarnings: 3,
        warningCountedTypes: ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'MULTIPLE_FACES'],
        autoTerminateOnMaxWarnings: false,
        answerAutosaveMs: 1200,
        heartbeatMs: 15000,
      },
    [thresholds]
  );

  const proctoring = useProctoring({
    sessionId: session?.id ?? null,
    sessionToken,
    socket,
    thresholds: effectiveThresholds,
    active: phase === 'exam',
    previewOnly: phase === 'syscheck',
    videoRef,
    stream: media.stream,
    videoLive: media.videoLive,
    audioLive: media.audioLive,
  });

  /* ------------------------------ answer saving ---------------------------- */

  const pendingRef = useRef<Map<string, number | null>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const credentialsRef = useLatest({ id: session?.id ?? null, token: sessionToken });

  const flushAnswers = useCallback(async () => {
    const { id, token } = credentialsRef.current;
    if (!id || !token) return;
    if (pendingRef.current.size === 0) return;

    const batch: AnswerPatch[] = [...pendingRef.current.entries()].map(
      ([questionId, selectedOption]) => ({ questionId, selectedOption })
    );
    pendingRef.current.clear();
    setSaveState('saving');

    try {
      const result = await candidateService.saveAnswers(id, token, batch);
      setSaveState('saved');
      setSession((current) =>
        current ? { ...current, remainingMs: result.remainingMs } : current
      );
    } catch (error) {
      // Keep the batch so the next flush retries it.
      batch.forEach((entry) => {
        if (!pendingRef.current.has(entry.questionId)) {
          pendingRef.current.set(entry.questionId, entry.selectedOption);
        }
      });
      setSaveState('error');

      if (error instanceof ApiRequestError && error.status === 409) {
        // The server closed the attempt because time ran out.
        toast.warning('Time is up', 'Your attempt was submitted automatically.');
        setPhase('submitted');
      }
    }
  }, [toast, credentialsRef]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flushAnswers();
    }, effectiveThresholds.answerAutosaveMs);
  }, [flushAnswers, effectiveThresholds.answerAutosaveMs]);

  const selectAnswer = useCallback(
    (questionId: string, optionIndex: number) => {
      setAnswers((current) => {
        const next = new Map(current);
        // Clicking the selected option again clears it.
        next.set(questionId, current.get(questionId) === optionIndex ? null : optionIndex);
        pendingRef.current.set(questionId, next.get(questionId) ?? null);
        return next;
      });
      scheduleFlush();
    },
    [scheduleFlush]
  );

  // Persist pending answers when the tab is hidden or the page unloads.
  useEffect(() => {
    if (phase !== 'exam') return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushAnswers();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [phase, flushAnswers]);

  useEffect(() => {
    if (phase !== 'exam') return;
    const warn = (event: BeforeUnloadEvent) => {
      void flushAnswers();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase, flushAnswers]);

  /* --------------------------------- submit -------------------------------- */

  const doSubmit = useCallback(
    async (reason: 'MANUAL' | 'TIME_EXPIRED') => {
      const { id, token } = credentialsRef.current;
      if (!id || !token) return;

      setSubmitting(true);
      try {
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        const finalAnswers: AnswerPatch[] = [...answers.entries()].map(
          ([questionId, selectedOption]) => ({ questionId, selectedOption })
        );
        pendingRef.current.clear();

        const result = await candidateService.submit(
          id,
          token,
          finalAnswers.length > 0 ? finalAnswers : undefined,
          reason
        );

        setSubmitResult(result);
        setConfirmOpen(false);
        setPhase('submitted');
        examSessionStore.clear(examId);
        media.stop();
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => undefined);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError ? error.message : 'Submission failed. Please try again.';
        toast.error('Could not submit', message);
      } finally {
        setSubmitting(false);
      }
    },
    [answers, examId, media, toast, credentialsRef]
  );

  const onTimeExpired = useCallback(() => {
    toast.warning('Time is up', 'Submitting your attempt automatically…');
    void doSubmit('TIME_EXPIRED');
  }, [doSubmit, toast]);

  const timer = useExamTimer(session?.remainingMs ?? null, phase === 'exam', onTimeExpired);

  /* ------------------------- heartbeat + clock sync ------------------------ */

  useEffect(() => {
    if (phase !== 'exam') return;
    const { id, token } = credentialsRef.current;
    if (!id || !token) return;

    const beat = async () => {
      try {
        const result = await candidateService.heartbeat(id, token);
        timer.sync(result.remainingMs);
        if (result.status === 'SUBMITTED') {
          toast.info('Attempt closed', 'This attempt was already submitted.');
          setPhase('submitted');
        }
      } catch {
        /* transient network error - the next beat will retry */
      }
    };

    const interval = window.setInterval(beat, effectiveThresholds.heartbeatMs);
    void beat();
    return () => window.clearInterval(interval);
    // `timer.sync` is stable; re-running on every tick would reset the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, effectiveThresholds.heartbeatMs]);

  /* --------------------------- initial data load --------------------------- */

  useEffect(() => {
    // A missing id is already reflected in the initial phase/error state.
    if (!examId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const [examInfo, config] = await Promise.all([
          candidateService.publicExam(examId),
          candidateService.proctoringConfig().catch(() => null),
        ]);
        if (cancelled) return;

        setPublicExam(examInfo);
        if (config?.thresholds) setThresholds(config.thresholds);

        // Try to resume an attempt from a previous page load.
        const stored = examSessionStore.get(examId);
        if (stored) {
          try {
            const restored = await candidateService.restore(stored.sessionToken);
            if (cancelled) return;

            if (restored.session.status === 'IN_PROGRESS' && restored.session.remainingMs > 0) {
              setSessionToken(stored.sessionToken);
              setSession(restored.session);
              setExam(restored.exam);
              setThresholds(restored.proctoring);
              setCandidateName(restored.session.candidateName);
              setCandidateEmail(restored.session.candidateEmail);
              setAnswers(
                new Map(restored.session.answers.map((a) => [a.questionId, a.selectedOption]))
              );
              setResumed(true);
              setPhase('syscheck');
              return;
            }

            if (restored.session.status === 'SUBMITTED') {
              examSessionStore.clear(examId);
              setSubmitResult({
                alreadySubmitted: true,
                submittedAt: restored.session.submittedAt ?? new Date().toISOString(),
                status: 'SUBMITTED',
                score: 0,
                totalMarks: restored.session.totalMarks,
                percentage: 0,
                reason: null,
              });
              setPhase('submitted');
              return;
            }

            examSessionStore.clear(examId);
          } catch {
            examSessionStore.clear(examId);
          }
        }

        setPhase('details');
      } catch (error) {
        if (cancelled) return;
        setFatalError(
          error instanceof ApiRequestError ? error.message : 'This exam link could not be opened.'
        );
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [examId]);

  /* ------------------------------ step actions ----------------------------- */

  const goToSystemCheck = (event: React.FormEvent) => {
    event.preventDefault();
    const errors: { name?: string; email?: string } = {};
    if (candidateName.trim().length < 2) errors.name = 'Enter your full name.';
    if (!EMAIL_RE.test(candidateEmail.trim())) errors.email = 'Enter a valid email address.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPhase('syscheck');
  };

  const startExam = async () => {
    setStarting(true);
    setStartError(null);
    try {
      // Fullscreen must be requested inside the click gesture, before any await.
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);

      if (resumed && session && sessionToken) {
        setPhase('exam');
        return;
      }

      const result = await candidateService.start(
        examId,
        candidateName.trim(),
        candidateEmail.trim().toLowerCase()
      );

      examSessionStore.set(examId, {
        sessionToken: result.sessionToken,
        sessionId: result.session.id,
        examId,
        candidateName: result.session.candidateName,
        candidateEmail: result.session.candidateEmail,
      });

      setSessionToken(result.sessionToken);
      setSession(result.session);
      setExam(result.exam);
      setThresholds(result.proctoring);
      setAnswers(new Map(result.session.answers.map((a) => [a.questionId, a.selectedOption])));
      setPhase('exam');
    } catch (error) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setStartError(
        error instanceof ApiRequestError ? error.message : 'Could not start the exam. Please retry.'
      );
    } finally {
      setStarting(false);
    }
  };

  /* ----------------------------- system checks ----------------------------- */

  const checks: CheckItem[] = useMemo(() => {
    const cameraState: CheckState =
      media.status === 'requesting'
        ? 'checking'
        : media.hasVideo && media.videoLive
          ? 'pass'
          : media.status === 'idle'
            ? 'pending'
            : 'fail';

    const micState: CheckState =
      media.status === 'requesting'
        ? 'checking'
        : media.hasAudio && media.audioLive
          ? 'pass'
          : media.status === 'idle'
            ? 'pending'
            : 'fail';

    const browserOk =
      typeof navigator.mediaDevices?.getUserMedia === 'function' && 'AudioContext' in window;

    const fullscreenOk = Boolean(document.documentElement.requestFullscreen);

    const faceState: CheckState =
      proctoring.face.status === 'ready'
        ? proctoring.face.faceCount === null
          ? 'checking'
          : proctoring.face.faceCount >= 1
            ? 'pass'
            : 'warn'
        : proctoring.face.status === 'loading'
          ? 'checking'
          : proctoring.face.status === 'unavailable'
            ? 'fail'
            : 'pending';

    return [
      {
        key: 'camera',
        label: 'Camera',
        required: true,
        state: cameraState,
        detail:
          cameraState === 'pass'
            ? 'Video stream is live.'
            : media.error ?? 'Allow camera access to continue.',
      },
      {
        key: 'microphone',
        label: 'Microphone',
        required: true,
        state: micState,
        detail:
          micState === 'pass'
            ? 'Audio stream is live.'
            : media.error ?? 'Allow microphone access to continue.',
      },
      {
        key: 'browser',
        label: 'Browser support',
        required: true,
        state: browserOk ? 'pass' : 'fail',
        detail: browserOk
          ? 'Media and Web Audio APIs available.'
          : 'Use a recent Chrome, Edge or Firefox build.',
      },
      {
        key: 'fullscreen',
        label: 'Fullscreen support',
        required: true,
        state: fullscreenOk ? 'pass' : 'fail',
        detail: fullscreenOk
          ? 'The exam will open in fullscreen.'
          : 'This browser cannot enter fullscreen.',
      },
      {
        key: 'face',
        label: 'Face detection',
        required: false,
        state: faceState,
        detail:
          proctoring.face.status === 'unavailable'
            ? proctoring.face.error ??
              'Model unavailable. The exam can still run; face checks will be skipped.'
            : faceState === 'pass'
              ? `On-device detector running (${proctoring.face.frames} frames analysed).`
              : faceState === 'warn'
                ? 'Detector running but no face is visible right now.'
                : 'Loading the on-device model…',
      },
    ];
  }, [media, proctoring.face]);

  const canStart = allRequiredPassed(checks);

  /* -------------------------------- rendering ------------------------------ */

  if (phase === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-ink-100">
        <PageLoader label="Opening exam…" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <CandidateShell>
        <Card>
          <ErrorState title="This exam link cannot be opened" message={fatalError ?? undefined} />
        </Card>
      </CandidateShell>
    );
  }

  if (phase === 'submitted') {
    return (
      <CandidateShell>
        <Card>
          <CardBody className="py-12 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-2xl font-black text-emerald-600">
              ✓
            </span>
            <h1 className="mt-4 text-xl font-bold text-ink-900">Exam Submitted Successfully</h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Thank you for completing the exam.
            </p>
            <div className="mx-auto mt-6 max-w-sm space-y-2 text-left">
              <InlineAlert tone="success" title="Your answers are recorded">
                {submitResult?.submittedAt
                  ? `Submitted at ${new Date(submitResult.submittedAt).toLocaleString()}.`
                  : 'Your attempt has been closed.'}{' '}
                Results are released by the exam administrator.
              </InlineAlert>
              {submitResult?.reason === 'TIME_EXPIRED' ? (
                <InlineAlert tone="warning">
                  The attempt was submitted automatically because the time limit was reached.
                </InlineAlert>
              ) : null}
            </div>
            <p className="mt-6 text-xs text-ink-500">You may now close this tab.</p>
          </CardBody>
        </Card>
      </CandidateShell>
    );
  }

  if (phase === 'details') {
    if (publicExam && !publicExam.isActive) {
      return (
        <CandidateShell>
          <Card>
            <CardBody className="py-12 text-center">
              <h1 className="text-lg font-bold text-ink-900">{publicExam.title}</h1>
              <p className="mt-2 text-sm text-ink-600">
                This exam is not accepting attempts right now. Contact your exam administrator.
              </p>
            </CardBody>
          </Card>
        </CandidateShell>
      );
    }

    return (
      <CandidateShell>
        <div className="mb-4">
          <StepBar current={1} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Step 1 — Candidate information" description="Used to identify your attempt." />
            <CardBody>
              <form onSubmit={goToSystemCheck} className="space-y-4">
                <Input
                  label="Full name"
                  required
                  autoComplete="name"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  error={formErrors.name}
                  placeholder="Alex Kumar"
                />
                <Input
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  error={formErrors.email}
                  hint="One attempt per email address for this exam."
                  placeholder="alex@example.com"
                />
                <Button type="submit" size="lg">
                  Continue to system check
                </Button>
              </form>
            </CardBody>
          </Card>

          <ExamSummaryCard exam={publicExam} />
        </div>
      </CandidateShell>
    );
  }

  /* -------------------------------- syscheck ------------------------------- */

  if (phase === 'syscheck') {
    return (
      <CandidateShell>
        <div className="mb-4">
          <StepBar current={2} />
        </div>

        {resumed ? (
          <div className="mb-4">
            <InlineAlert tone="info" title="Resuming your attempt">
              You already started this exam. Your saved answers were restored and the clock kept
              running.
            </InlineAlert>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Step 2 — System check"
              description="All required checks must pass before the exam can start."
            />
            <SystemCheckList items={checks} />
            <CardBody className="space-y-3 border-t border-ink-200">
              {media.status === 'idle' ? (
                <Button size="lg" onClick={() => void media.request()}>
                  Allow camera &amp; microphone
                </Button>
              ) : media.status === 'requesting' ? (
                <Button size="lg" loading>
                  Requesting access…
                </Button>
              ) : media.status !== 'granted' ? (
                <div className="space-y-3">
                  <InlineAlert tone="danger" title="Device access is required">
                    {media.error}
                  </InlineAlert>
                  <Button variant="secondary" onClick={() => void media.request()}>
                    Try again
                  </Button>
                </div>
              ) : null}

              {startError ? <InlineAlert tone="danger">{startError}</InlineAlert> : null}

              {proctoring.face.status === 'unavailable' ? (
                <InlineAlert tone="warning" title="Face detection unavailable">
                  {proctoring.face.error} The exam can still be taken; camera, audio, tab and
                  fullscreen monitoring remain active.
                </InlineAlert>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" disabled={!canStart || starting} loading={starting} onClick={startExam}>
                  {resumed ? 'Resume exam' : 'Start exam'}
                </Button>
                {!canStart ? (
                  <p className="text-xs text-ink-500">
                    Complete the required checks above to enable this button.
                  </p>
                ) : (
                  <p className="text-xs text-ink-500">
                    The exam opens in fullscreen and the timer starts immediately.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Camera preview" description="This is what the proctor records." />
              <CardBody>
                <CameraPreview
                  videoRef={videoRef}
                  stream={media.stream}
                  boxes={proctoring.face.boxes}
                  faceCount={proctoring.face.faceCount}
                  detectorReady={proctoring.face.status === 'ready'}
                />
                <MicMeter volume={proctoring.noise.volume} threshold={effectiveThresholds.noiseVolumeThreshold} />
              </CardBody>
            </Card>
            <ExamSummaryCard exam={publicExam ?? (exam as unknown as PublicExam)} />
            <Card>
              <CardHeader title="What is monitored" />
              <CardBody>
                <ul className="space-y-1.5 text-xs text-ink-600">
                  <li>• Camera: face present, and whether more than one face is visible.</li>
                  <li>• Microphone: loudness only (no speech recognition).</li>
                  <li>• Leaving the exam tab or window.</li>
                  <li>• Leaving fullscreen mode.</li>
                  <li>• Camera or microphone being disconnected.</li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      </CandidateShell>
    );
  }

  /* --------------------------------- exam ---------------------------------- */

  if (!exam || !session) return null;

  const question = exam.questions[currentIndex];
  const answeredIds = new Set(
    [...answers.entries()].filter(([, value]) => value !== null).map(([key]) => key)
  );
  const lowTime = timer.remainingMs <= 60_000;

  return (
    <div className="flex min-h-svh flex-col bg-ink-100">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Logo className="text-ink-900" />
            <span className="hidden text-sm text-ink-500 sm:inline">{exam.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator state={saveState} />
            <span
              className={
                'rounded-lg px-3 py-1.5 font-mono text-sm font-bold tabular-nums ' +
                (lowTime ? 'bg-rose-600 text-white' : 'bg-ink-900 text-white')
              }
              role="timer"
              aria-live="off"
            >
              Time Left: {formatDuration(timer.remainingMs)}
            </span>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2">
          <ProctorStatusStrip
            proctoring={proctoring}
            tabVisible={proctoring.tabVisible}
            socketConnected={socketConnected}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <div className="mb-4 space-y-3">
          {!proctoring.fullscreen.isFullscreen ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-900">
                Please return to fullscreen mode. Leaving fullscreen is recorded.
              </p>
              <Button size="sm" onClick={() => void proctoring.fullscreen.enter()}>
                Re-enter fullscreen
              </Button>
            </div>
          ) : null}

          <ProctorWarnings
            alerts={proctoring.alerts}
            warningCount={proctoring.warningCount}
            maxWarnings={proctoring.maxWarnings}
            onDismiss={proctoring.dismissAlert}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader
              title={`Question ${currentIndex + 1} of ${exam.questions.length}`}
              description={`${question.marks} mark${question.marks === 1 ? '' : 's'}`}
              action={
                answeredIds.has(question.id) ? (
                  <Badge tone="success">Answered</Badge>
                ) : (
                  <Badge tone="neutral">Unanswered</Badge>
                )
              }
            />
            <CardBody>
              <p className="text-base font-semibold text-ink-900">{question.questionText}</p>

              <fieldset className="mt-4">
                <legend className="sr-only">Select one answer</legend>
                <div className="space-y-2">
                  {question.options.map((option, index) => {
                    const selected = answers.get(question.id) === index;
                    return (
                      <label
                        key={index}
                        className={
                          'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ' +
                          (selected
                            ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                            : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-ink-50')
                        }
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          checked={selected}
                          onChange={() => selectAnswer(question.id, index)}
                          className="mt-1 size-4 accent-brand-600"
                        />
                        <span className="min-w-0 text-sm text-ink-800">
                          <span className="mr-1.5 font-mono text-xs font-bold text-ink-500">
                            {optionLetter(index)}.
                          </span>
                          {option}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-6 flex items-center justify-between gap-2 border-t border-ink-200 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                >
                  Previous
                </Button>
                <span className="text-xs text-ink-500">
                  {answeredIds.size} of {exam.questions.length} answered
                </span>
                {currentIndex < exam.questions.length - 1 ? (
                  <Button onClick={() => setCurrentIndex((i) => Math.min(exam.questions.length - 1, i + 1))}>
                    Next
                  </Button>
                ) : (
                  <Button variant="success" onClick={() => setConfirmOpen(true)}>
                    Submit Exam
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Camera" />
              <CardBody>
                <CameraPreview
                  videoRef={videoRef}
                  stream={media.stream}
                  boxes={proctoring.face.boxes}
                  faceCount={proctoring.face.faceCount}
                  detectorReady={proctoring.face.status === 'ready'}
                  compact
                />
                <MicMeter
                  volume={proctoring.noise.volume}
                  threshold={effectiveThresholds.noiseVolumeThreshold}
                />
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <QuestionNavigator
                  total={exam.questions.length}
                  currentIndex={currentIndex}
                  answeredIds={answeredIds}
                  questionIds={exam.questions.map((q) => q.id)}
                  onJump={setCurrentIndex}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={`Recorded events (${proctoring.violations.length})`} />
              <CardBody className="max-h-56 overflow-y-auto scrollbar-thin">
                {proctoring.violations.length === 0 ? (
                  <p className="text-xs text-ink-500">
                    No proctoring events recorded. Keep your face visible and stay in fullscreen.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {proctoring.violations.map((violation) => (
                      <li key={violation.id} className="flex items-start gap-2 text-xs">
                        <span className="font-mono text-ink-400 tabular-nums">
                          {new Date(violation.at).toLocaleTimeString()}
                        </span>
                        <span className="min-w-0 flex-1 text-ink-700">{violation.type}</span>
                        <span
                          className={
                            'shrink-0 font-semibold ' +
                            (violation.persisted ? 'text-emerald-600' : 'text-amber-600')
                          }
                        >
                          {violation.persisted ? 'saved' : 'sending'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Button variant="success" fullWidth size="lg" onClick={() => setConfirmOpen(true)}>
              Submit Exam
            </Button>
          </div>
        </div>
      </main>

      <Modal
        open={confirmOpen}
        title="Are you sure you want to submit?"
        description={
          <>
            You answered <strong>{answeredIds.size}</strong> of{' '}
            <strong>{exam.questions.length}</strong> questions
            {answeredIds.size < exam.questions.length
              ? `, leaving ${exam.questions.length - answeredIds.size} blank`
              : ''}
            . You cannot change your answers after submitting.
          </>
        }
        onClose={() => (submitting ? undefined : setConfirmOpen(false))}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="success" loading={submitting} onClick={() => void doSubmit('MANUAL')}>
              Submit
            </Button>
          </>
        }
      />
    </div>
  );
}

/* ------------------------------- sub-components --------------------------- */

function CandidateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-ink-100">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Logo className="text-ink-900" />
          <span className="text-xs font-medium text-ink-500">Proctored assessment</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function StepBar({ current }: { current: 1 | 2 }) {
  const steps = ['Candidate information', 'System check', 'Exam'];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((label, index) => {
        const step = index + 1;
        const state = step < current ? 'done' : step === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                'flex size-6 items-center justify-center rounded-full font-bold ' +
                (state === 'done'
                  ? 'bg-emerald-500 text-white'
                  : state === 'active'
                    ? 'bg-brand-600 text-white'
                    : 'bg-ink-200 text-ink-500')
              }
            >
              {state === 'done' ? '✓' : step}
            </span>
            <span className={state === 'todo' ? 'text-ink-400' : 'font-semibold text-ink-700'}>
              {label}
            </span>
            {step < steps.length ? <span className="text-ink-300">—</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ExamSummaryCard({ exam }: { exam: PublicExam | null }) {
  if (!exam) return null;
  return (
    <Card>
      <CardHeader title="Exam details" />
      <CardBody>
        <h3 className="text-sm font-bold text-ink-900">{exam.title}</h3>
        {exam.description ? (
          <p className="mt-1 text-xs text-ink-600">{exam.description}</p>
        ) : null}
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Duration</dt>
            <dd className="font-semibold text-ink-900">{formatMinutes(exam.duration)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Questions</dt>
            <dd className="font-semibold text-ink-900">{exam.questionCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Total marks</dt>
            <dd className="font-semibold text-ink-900">{exam.totalMarks}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

function MicMeter({ volume, threshold }: { volume: number; threshold: number }) {
  const pct = Math.min(100, Math.round((volume / Math.max(threshold * 2, 0.001)) * 100));
  const loud = volume >= threshold;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px] text-ink-500">
        <span>Microphone level</span>
        <span className={loud ? 'font-semibold text-rose-600' : undefined}>
          {loud ? 'loud' : 'quiet'}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
        <div
          className={'h-full transition-[width] ' + (loud ? 'bg-rose-500' : 'bg-emerald-500')}
          style={{ width: `${pct}%` }}
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Microphone level"
        />
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; className: string }> = {
    idle: { text: 'Answers autosave', className: 'text-ink-400' },
    saving: { text: 'Saving…', className: 'text-amber-600' },
    saved: { text: 'Saved', className: 'text-emerald-600' },
    error: { text: 'Retrying save…', className: 'text-rose-600' },
  };
  const item = map[state];
  return <span className={'hidden text-xs font-medium sm:inline ' + item.className}>{item.text}</span>;
}
