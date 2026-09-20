import type { Severity, ViolationType } from '../types';

/**
 * Presentation-only mapping. The authoritative severity per violation type lives
 * on the server (`server/src/config/proctoring.ts`) and travels with each record.
 */
export const VIOLATION_LABELS: Record<ViolationType, string> = {
  NO_FACE: 'Face not detected',
  MULTIPLE_FACES: 'Multiple faces detected',
  TAB_SWITCH: 'Left the exam window',
  FULLSCREEN_EXIT: 'Exited fullscreen',
  NO_CAMERA: 'Camera unavailable',
  NO_MICROPHONE: 'Microphone unavailable',
  NOISE_DETECTED: 'Unusual audio detected',
};

export const VIOLATION_MESSAGES: Record<ViolationType, string> = {
  NO_FACE: 'Face not detected. Please remain visible to the camera.',
  MULTIPLE_FACES: 'Multiple faces detected. Only the candidate may be on camera.',
  TAB_SWITCH: 'You left the exam window. Please return immediately.',
  FULLSCREEN_EXIT: 'Please return to fullscreen mode.',
  NO_CAMERA: 'Camera stream lost. Please restore camera access.',
  NO_MICROPHONE: 'Microphone stream lost. Please restore microphone access.',
  NOISE_DETECTED: 'Unusual audio detected. Please maintain a quiet environment.',
};

export const SEVERITY_STYLES: Record<Severity, string> = {
  LOW: 'bg-amber-50 text-amber-700 ring-amber-200',
  MEDIUM: 'bg-orange-50 text-orange-700 ring-orange-200',
  HIGH: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function violationLabel(type: ViolationType): string {
  return VIOLATION_LABELS[type] ?? type;
}
