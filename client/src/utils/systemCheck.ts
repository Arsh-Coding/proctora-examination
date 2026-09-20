export type CheckState = 'pending' | 'checking' | 'pass' | 'fail' | 'warn';

export interface CheckItem {
  key: string;
  label: string;
  state: CheckState;
  detail?: string;
  /** Required checks block the exam from starting. */
  required: boolean;
}

/** The exam may only start once every required check has passed. */
export function allRequiredPassed(items: CheckItem[]): boolean {
  return items.every((item) => !item.required || item.state === 'pass');
}
