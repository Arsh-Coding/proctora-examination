/**
 * Single source of truth for proctoring rules.
 *
 * Both the API and the browser client read from here: the client fetches this
 * object at exam start (`GET /api/proctoring/config`) so thresholds only ever
 * need to change in one place.
 */

export const VIOLATION_TYPES = [
  'NO_FACE',
  'MULTIPLE_FACES',
  'TAB_SWITCH',
  'FULLSCREEN_EXIT',
  'NO_CAMERA',
  'NO_MICROPHONE',
  'NOISE_DETECTED',
] as const;

export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const VIOLATION_SEVERITY: Record<ViolationType, Severity> = {
  NOISE_DETECTED: 'LOW',
  TAB_SWITCH: 'MEDIUM',
  FULLSCREEN_EXIT: 'MEDIUM',
  NO_FACE: 'MEDIUM',
  NO_CAMERA: 'HIGH',
  NO_MICROPHONE: 'MEDIUM',
  MULTIPLE_FACES: 'HIGH',
};

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  NO_FACE: 'Face not detected',
  MULTIPLE_FACES: 'Multiple faces detected',
  TAB_SWITCH: 'Left the exam window',
  FULLSCREEN_EXIT: 'Exited fullscreen',
  NO_CAMERA: 'Camera unavailable',
  NO_MICROPHONE: 'Microphone unavailable',
  NOISE_DETECTED: 'Unusual audio detected',
};

/** Candidate-facing warning copy, kept next to the rules that raise them. */
export const VIOLATION_MESSAGES: Record<ViolationType, string> = {
  NO_FACE: 'Face not detected. Please remain visible to the camera.',
  MULTIPLE_FACES: 'Multiple faces detected. Only the candidate may be on camera.',
  TAB_SWITCH: 'You left the exam window. Please return immediately.',
  FULLSCREEN_EXIT: 'Please return to fullscreen mode.',
  NO_CAMERA: 'Camera stream lost. Please restore camera access.',
  NO_MICROPHONE: 'Microphone stream lost. Please restore microphone access.',
  NOISE_DETECTED: 'Unusual audio detected. Please maintain a quiet environment.',
};

export const PROCTORING_CONFIG = {
  /** How often the face detector samples the video feed. */
  faceDetectionIntervalMs: 1200,
  /** Continuous "no face" time before a NO_FACE violation is raised. */
  noFaceGraceMs: 6000,
  /** Continuous "more than one face" time before MULTIPLE_FACES is raised. */
  multipleFacesGraceMs: 2500,
  /** Minimum detector confidence for a box to count as a face. */
  faceMinConfidence: 0.5,

  /** Normalised RMS volume (0..1) that counts as loud. */
  noiseVolumeThreshold: 0.14,
  /** Sustained loud time before NOISE_DETECTED is raised. */
  noiseSustainMs: 3000,

  /** Per-type cooldown so one long event does not spam hundreds of rows. */
  violationCooldownMs: {
    NO_FACE: 20000,
    MULTIPLE_FACES: 20000,
    TAB_SWITCH: 1500,
    FULLSCREEN_EXIT: 3000,
    NO_CAMERA: 30000,
    NO_MICROPHONE: 30000,
    NOISE_DETECTED: 30000,
  } satisfies Record<ViolationType, number>,

  /** Warning budget surfaced to the candidate ("Warning 1/3"). */
  maxWarnings: 3,
  /** Types that consume the warning budget. */
  warningCountedTypes: ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'MULTIPLE_FACES'] as ViolationType[],
  /** MVP never auto-terminates an exam; violations are recorded for review. */
  autoTerminateOnMaxWarnings: false,

  /** Answer autosave debounce on the client. */
  answerAutosaveMs: 1200,
  /** Client -> server clock sync / liveness ping. */
  heartbeatMs: 15000,
} as const;

export function severityFor(type: ViolationType): Severity {
  return VIOLATION_SEVERITY[type];
}

export const publicProctoringConfig = {
  violationTypes: VIOLATION_TYPES,
  severities: SEVERITIES,
  severityByType: VIOLATION_SEVERITY,
  labels: VIOLATION_LABELS,
  messages: VIOLATION_MESSAGES,
  thresholds: PROCTORING_CONFIG,
};
